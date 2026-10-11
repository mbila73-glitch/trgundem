// Tek process pipeline — exec/spawn yok, process limit dolmaz
// Tüm script'leri require ile çağırır, process.exit'i geçici olarak engeller

var path=require('path');
var fs=require('fs');
var{PrismaClient}=require('@prisma/client');
var db=new PrismaClient();
var SF=path.join(process.cwd(),'pipeline-status.json');
var LF=path.join(process.cwd(),'pipeline-once.log');

function log(m){var ts=new Date().toISOString();console.log('['+ts+'] '+m);}
function ws(s){try{var c=null;try{c=JSON.parse(fs.readFileSync(SF,'utf8'))}catch(e){}var m=Object.assign({},c,s);fs.writeFileSync(SF,JSON.stringify(m,null,2),'utf8');}catch(e){}}

// process.exit'i geçici olarak engelle — script'ler exit çağırırsa process ölmesin
var origExit=process.exit;
var exitCalled=false;
process.exit=function(code){exitCalled=true;log('process.exit('+code+') engellendi — devam ediliyor';};

async function runScript(scriptPath,name){
  log('▶ '+name);
  try{
    // require cache'i temizle
    var full=path.resolve(scriptPath);
    delete require.cache[full];
    require(scriptPath);
    log('✓ '+name);
  }catch(e){
    log('✗ '+name+': '+e.message);
  }
}

async function main(){
  log('=== Cycle basladi ===');
  ws({stage:'archive-stale',startedAt:new Date().toISOString(),finishedAt:null,rssRead:0,duplicatesFound:0,summariesDone:0,publishedCount:null,error:null});
  
  log('Step1: deleteMany drafts');
  try{var r=await db.publishedArticle.deleteMany({where:{status:'draft'}});log('Drafts: '+r.count);}catch(e){log('DelErr: '+e.message);}
  
  ws({stage:'refresh'});
  await runScript('scripts/trigger-refresh.js','RSS');
  var rssCount=0;
  try{var lf=fs.readFileSync(LF,'utf8');var m=lf.match(/İşlenen kaynak:\s*(\d+)/);if(m)rssCount=parseInt(m[1]);}catch(e){}
  ws({rssRead:rssCount});
  
  ws({stage:'build-icerik'});
  await runScript('scripts/build-rss-icerik.js','icerik');
  
  ws({stage:'build-kaynak-sayi'});
  await runScript('scripts/build-rss-icerik.js','kaynak-sayi');
  
  ws({duplicatesFound:0});
  ws({stage:'build-ozet'});
  await runScript('scripts/build-rss-ozet.js','AI');
  var sumCount=0;
  try{var lf2=fs.readFileSync(LF,'utf8');var m2=lf2.match(/(\d+)\s*yeni\s*AI\s*özet/i);if(m2)sumCount=parseInt(m2[1]);}catch(e){}
  ws({summariesDone:sumCount});
  
  log('Step9: count');
  try{var p=await db.publishedArticle.count({where:{status:'published'}});log('Published: '+p);ws({publishedCount:p});}catch(e){log('CntErr: '+e.message);}
  
  ws({stage:'done',finishedAt:new Date().toISOString()});
  log('=== Cycle tamam ===');
  
  // process.exit'i geri yükle
  process.exit=origExit;
  await db.$disconnect();
  process.exit(0);
}

main().catch(function(e){log('FATAL: '+e.message);process.exit=origExit;process.exit(1);});
