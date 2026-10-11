import paramiko
import time

HOST = '31.40.205.148'
USER = 'root'
PASS = 'f39ebeca53fd!diyo@'

print(f"Bağlanılıyor: {USER}@{HOST}")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("✓ Bağlandı!")
except Exception as e:
    print(f"✗ Bağlantı hatası: {e}")
    exit(1)

def run(cmd, timeout=120):
    print(f"\n>>> {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out:
        print(out[-2000:] if len(out) > 2000 else out)
    if err:
        print("STDERR:", err[-1000:] if len(err) > 1000 else err)
    return out, err

# 1. Temizle
run("cd /var/www && rm -rf db .env .next package.json package-lock.json prisma public scripts server.js node_modules html trgundem-full.zip next-full.zip 2>/dev/null; ls -la")

# 2. Git clone
run("cd /var/www && git clone https://github.com/mbila73-glitch/trgundem.git . 2>&1 | tail -20", timeout=180)

# 3. Kontrol
run("cd /var/www && ls -la")

# 4. .env oluştur
env_content = """DATABASE_URL=file:/var/www/db/custom.db
SMTP_HOST=mail.trgundem.net
SMTP_PORT=465
SMTP_USER=temsilci@trgundem.net
SMTP_PASS=SENIN_EMAIL_SIFREN
SMTP_TO=temsilci@trgundem.net
GEMINI_API_KEY=SENIN_GEMINI_KEY
"""
run(f"cd /var/www && cat > .env << 'EOF'\n{env_content}EOF")
run("cat /var/www/.env")

ssh.close()
print("\n✓ Adım 1-4 tamam. npm install devam edelim.")
