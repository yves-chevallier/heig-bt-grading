import { scryptSync, randomBytes } from 'node:crypto';
import readline from 'node:readline';
if (!process.stdin.isTTY) {
  console.error('Lancez cette commande dans un terminal interactif.');
  process.exit(1);
}
process.stdout.write('Mot de passe administrateur (12 caractères minimum, saisie masquée) : ');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
let password = '';
process.stdin.on('keypress', (text, key) => {
  if (key?.ctrl && key.name === 'c') process.exit(130);
  if (key?.name === 'return') {
    process.stdin.setRawMode(false);
    if (password.length < 12) {
      console.error('\nMinimum 12 caractères.');
      process.exit(1);
    }
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    console.log(`\nADMIN_PASSWORD_HASH='scrypt$${salt}$${hash}'`);
    process.exit(0);
  }
  if (key?.name === 'backspace') password = password.slice(0, -1);
  else if (text && !key?.ctrl && !key?.meta) password += text;
});
