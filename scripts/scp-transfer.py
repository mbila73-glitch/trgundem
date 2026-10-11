import paramiko
import sys

HOST = '31.40.205.148'
USER = 'root'
PASS = 'f39ebeca53fd!diyo@'
LOCAL = '/home/z/my-project/download/trgundem-src.zip'
REMOTE = '/var/www/trgundem-src.zip'

print(f"Bağlanılıyor: {USER}@{HOST}")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    print("Bağlandı!")
except Exception as e:
    print(f"Bağlantı hatası: {e}")
    sys.exit(1)

print(f"Dosya transfer: {LOCAL} → {REMOTE}")
try:
    sftp = ssh.open_sftp()
    sftp.put(LOCAL, REMOTE)
    stat = sftp.stat(REMOTE)
    print(f"Transfer tamam! Boyut: {stat.st_size} byte")
    sftp.close()
except Exception as e:
    print(f"Transfer hatası: {e}")
    ssh.close()
    sys.exit(1)

# Unzip komutu çalıştır
print("Unzip yapılıyor...")
stdin, stdout, stderr = ssh.exec_command('cd /var/www && unzip -o trgundem-src.zip && ls -la src/app/ | head -10')
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("STDERR:", err)

ssh.close()
print("Tamam!")
