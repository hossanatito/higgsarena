/**
 * Rejects common and trivially guessable passwords. The list focuses on
 * entries of 10+ characters, since shorter ones already fail the length rule.
 */
const COMMON = new Set(
  `1234567890 0123456789 0987654321 9876543210 1111111111 0000000000 1234512345 1122334455 1234554321 12345678910
  1234567891 1q2w3e4r5t 1qaz2wsx3edc qwertyuiop qwertyuiop1 asdfghjkl1 zxcvbnm123 qwerty1234 qwerty12345 qwerty123456
  1qaz2wsx3e q1w2e3r4t5 a1b2c3d4e5 abc1234567 abcdefghij abcdefg123 abcd123456 password12 password123 password1234
  password12345 passw0rd12 p@ssword12 p@ssw0rd123 password01 passwordpassword mypassword mypassword1 mypassword123
  iloveyou12 iloveyou123 letmein123 letmein1234 welcome123 welcome1234 trustno123 monkey1234 dragon1234 football12
  football123 baseball12 baseball123 basketball basketball1 superman12 superman123 batman1234 starwars12 starwars123
  sunshine12 sunshine123 princess12 princess123 charlie123 michael123 jennifer12 jordan2323 shadow1234 master1234
  computer12 computer123 internet12 changeme12 changeme123 administrator admin12345 admin123456 adminadmin
  rootroot12 test123456 testtest12 qazwsxedc1 qazwsxedcrfv zaq12wsxcde 123qweasdzxc 1q2w3e4r5t6y 123456789a
  123456789q a123456789 q123456789 1234567890q 123456789abc 11223344556677 987654321a 5201314520 7777777777
  9999999999 2222222222 3333333333 4444444444 5555555555 6666666666 8888888888 aaaaaaaaaa higgsfield higgsfield1
  higgsarena higgsarena1 higgsarena123`.split(/\s+/).filter(Boolean),
);

export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  const p = password.toLowerCase();
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (COMMON.has(p)) return "That password is too common. Pick something less predictable.";
  if (/^(.)\1+$/.test(p)) return "That password is a single repeated character.";
  if (/^(0123456789|1234567890|9876543210|abcdefghijklmnopqrstuvwxyz)+$/.test(p) || "01234567890123456789".includes(p) || "abcdefghijklmnopqrstuvwxyz".includes(p)) {
    return "That password is a simple sequence.";
  }
  if (/^password\d*$|^qwerty\d*$|^letmein\d*$|^welcome\d*$/.test(p)) return "That password is too common. Pick something less predictable.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && p.includes(local)) return "Don't include your email address in your password.";
  return null;
}
