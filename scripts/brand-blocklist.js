// MARKA BLOK LİSTESİ — başlıkta bu markalardan herhangi biri geçerse HABER YAYINLANMAZ
// User: "tesla fabrikası yandı bile deseler yayınlamayalaım. iphone ile adam öldürdü haberini bile engelleyelim"
// Kural: marka adı başlıkta varsa = ATLA (AI özet bile üretme, API çağrısı yapma)
//
// Tüm markalar lowercase + Türkçe karakterler ASCII'ye çevrilmiş
// Match: title lowercase + Türkçe normalize edilip includes() ile kontrol edilir
module.exports = [
  // === OTOMOBIL MARKALARI ===
  'togg','tofas','fiat','alfa romeo','ferrari','lamborghini','maserati','lancia','abarth','iveco',
  'otokar','karsan','temsa','bmc','anadolu isuzu','ford','ford otosan','lincoln','chevrolet',
  'cadillac','gmc','buick','chrysler','dodge','jeep','ram trucks','tesla','rivian','lucid',
  'fisker','faraday future','polestar','volvo','saab','koenigsegg','scania','renault','dacia',
  'alpine','bugatti','peugeot','citroen','ds automobiles','opel','vauxhall','mobilize',
  'toyota','lexus','daihatsu','suzuki','subaru','mazda','mitsubishi','nissan','infiniti',
  'honda','acura','hino','hyundai','genesis','kia','ssangyong','kg mobility','daewoo','kgm',
  'samsung motors','byd','chery','omoda','jaecoo','exeed','jetour','kaiyi','karry','geely',
  'zeekr','lynk & co','livan','proton','perodua','neta','leapmotor','nio','onvo','xpeng',
  'li auto','aito','avatr','seres','dongfeng','forthing','voyah','hongqi','faw','bestune',
  'jac motors','baic','arcfox','foton','gac','aion','trumpchi','great wall motors','gwm',
  'haval','tank','ora','wey','saic','mg motor','maxus','roewe','im motors','wuling','baojun',
  'changan','deepal','qiyuan','changan nevo','jmc','soueast','skywell','skyworth auto',
  'yutong','king long','golden dragon','zhongtong','ankai','dfsk','brilliance','jinbei',
  'lifan','zotye','hafei','landwind','foday','mahindra','tata motors','force motors',
  'ashok leyland','maruti suzuki','hindustan motors','premier','eicher','vinfast','w motors',
  'rimac','dallara','pininfarina','caterham','morgan','lotus','aston martin','bentley',
  'rolls-royce','mclaren','mini','bmw','mercedes-benz','mercedes-amg','mercedes-maybach',
  'smart','volkswagen','audi','porsche','skoda','seat','cupra','man','freightliner',
  'kenworth','peterbilt','international trucks','western star','mack','daf','kamaz','maz',
  'gaz','uaz','zil','paz','liaz','sollers','aurora','aurus','moskvich','lada','ural',
  'tatra','praga','avia',
  // === MOTOSIKLET MARKALARI ===
  'ktm','yamaha motor','honda motorcycles','suzuki motorcycle','kawasaki','bmw motorrad',
  'ducati','aprilia','moto guzzi','triumph motorcycles','royal enfield','bajaj','tvs',
  'hero motocorp','husqvarna','cfmoto','benelli','qjmotor','keeway','sym','kymco','piaggio',
  'vespa','lambretta','mondial','rks','arora','kuba','kanuni','yuki','volta','rks motor',
  'motolux','kral motor','falcon','brixton','zontes','voge','benda','qjmotor',
  'segway powersports','polaris','can-am','brp','arctic cat','linhai','tgb','aodes','cforce',
  // === TRAKTOR / TARIM ===
  'john deere','new holland','case ih','massey ferguson','fendt','claas','deutz-fahr',
  'kubota','yanmar','same','landini','basak traktor','turktraktor','hattat traktor',
  'erkunt traktor','tumosan','valtra','jcb',
  // === INSaat MAKINELARI ===
  'caterpillar','komatsu','hitachi construction','liebherr','volvo construction',
  'bobcat','doosan','sany','xcmg','zoomlion','jlg','manitou','genie','kobelco','hidromek',
  // === TELEFON / ELEKTRONIK MARKALARI ===
  'apple','iphone','samsung galaxy','xiaomi','redmi','poco','huawei','honor','oppo',
  'oneplus','realme','vivo','iqoo','tecno','infinix','itel','motorola','lenovo',
  'nothing phone','cmf','google pixel','pixel','sony xperia','asus zenfone','rog phone',
  'zte','nubia','redmagic','hmd','nokia','tcl','alcatel','general mobile','casper','via',
  'reeder','vestel','venus','omix','meizu','sharp','fairphone','doogee','ulefone','oukitel',
  'blackview','cubot','umidigi','unihertz','blu','wiko','crosscall','cat phones','sonim',
  'kyocera','energizer mobile','blackberry','htc','lg mobile','microsoft lumia',
  'sony ericsson','panasonic mobile','philips mobile','gigaset','leeco','yota phone',
  'vertu','bittium','cherry mobile','cloudfone','hisense','haier','konka','coolpad',
  'turing phone','doro','emporia','tcl nxtpaper','agm','thuraya','inmarsat',
  // === DIGER ===
  'samsung motors','mitsubishi fuso','isuzu motors','fuso','hino motors','ud trucks',
  'renault trucks','volvo trucks','mercedes trucks','samsung','huawei watch',
  'apple watch','galaxy watch'
];
