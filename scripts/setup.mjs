import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function hiddenInput(label) {
  return new Promise((resolve, reject) => {
    process.stdout.write(label);
    let value = '';
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = (error) => {
      process.stdin.off('data', receive);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value.trim());
    };
    const receive = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Kurulum iptal edildi. Oluşturulan .env korunuyor.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (value.length < 2048) value += char;
      }
    };
    process.stdin.on('data', receive);
  });
}

const root = resolve(import.meta.dirname, '..');
const destination = resolve(root, '.env');
if (existsSync(destination)) {
  console.log('Mevcut .env korundu. Anahtarları güncellemek için bu dosyayı açın; kurulum verilerinizi sıfırlamaz.');
} else {
  const password = randomBytes(18).toString('base64url');
  const secret = randomBytes(48).toString('base64url');
  const example = readFileSync(resolve(root, '.env.example'), 'utf8');
  const content = example.replace('change-this-to-a-long-unique-password', password)
    .replace('replace-with-at-least-32-random-characters', secret);
  writeFileSync(destination, content, { flag: 'wx', mode: 0o600 });
  console.log('Yerel .env dosyası oluşturuldu (macOS/Linux: dosya izni 0600).');
  console.log(`Yönetici şifren: ${password}`);
  console.log('Şifreyi güvenli bir yere kaydet. Bu komut tekrar çalıştırıldığında şifre değişmez.');
  if (process.stdin.isTTY && process.stdout.isTTY) {
    console.log('\nAnahtarları şimdi girebilirsin (yazdıkların ekranda görünmez). Boş bırakmak için Enter.');
    const fields = ['OPENAI_API_KEY', 'X_CLIENT_ID', 'X_CLIENT_SECRET'];
    let updated = content;
    for (const field of fields) {
      const value = await hiddenInput(`${field}: `);
      if (value) {
        if (!/^[^\s#="'\\\u0000-\u001f\u007f]{1,2048}$/.test(value)) {
          console.error(`${field} beklenmeyen karakter içeriyor; dosyaya yazılmadı.`);
          continue;
        }
        updated = updated.replace(`${field}=`, `${field}=${value}`);
      }
    }
    writeFileSync(destination, updated, { mode: 0o600 });
  }
}
console.log('\nSonraki adım: npm start → terminalde gösterilen adres → giriş → Kurulum ve bağlantılar.');
console.log('OpenAI ve X OAuth 2.0 Client ID / Client Secret bilgilerini panelden kaydedebilirsin.');
console.log('X callback adresi, kullanım açıklaması ve adım adım Console rehberi panelde bulunur.');
console.log(`İleri düzey yapılandırma dosyası: ${destination}`);
console.log('X ve OpenAI kullanımı kullanıcının kendi hesabında ücretlendirilir; yayın ancak açık onayla yapılır.');
