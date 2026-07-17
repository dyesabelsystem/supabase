export interface PasswordRequirement {
  key: string;
  label: string;
  met: boolean;
}

export const getPasswordRequirements = (password: string): PasswordRequirement[] => [
  { key: 'length', label: 'At least 12 characters', met: password.length >= 12 },
  { key: 'lowercase', label: 'One lowercase letter', met: /[a-z]/.test(password) },
  { key: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(password) },
  { key: 'number', label: 'One number', met: /\d/.test(password) },
  { key: 'symbol', label: 'One symbol', met: /[^A-Za-z0-9\s]/.test(password) },
  { key: 'spacing', label: 'No spaces', met: !/\s/.test(password) }
];

export const getPasswordValidationError = (
  password: string,
  context?: { username?: string; email?: string }
): string | null => {
  const unmet = getPasswordRequirements(password).filter((requirement) => !requirement.met);
  if (unmet.length) return `Password must include: ${unmet.map((requirement) => requirement.label.toLowerCase()).join(', ')}.`;

  const normalizedPassword = password.toLowerCase();
  const username = String(context?.username || '').trim().toLowerCase();
  const emailName = String(context?.email || '').split('@')[0].trim().toLowerCase();
  if (username.length >= 4 && normalizedPassword.includes(username)) return 'Password must not contain the user name.';
  if (emailName.length >= 4 && normalizedPassword.includes(emailName)) return 'Password must not contain the email name.';
  return null;
};

export const getPasswordStrength = (password: string) => {
  const metCount = getPasswordRequirements(password).filter((requirement) => requirement.met).length;
  if (!password) return { label: 'Not entered', score: 0, className: 'bg-gray-300 dark:bg-white/10' };
  if (metCount <= 2) return { label: 'Weak', score: 25, className: 'bg-red-500' };
  if (metCount <= 4) return { label: 'Fair', score: 50, className: 'bg-amber-500' };
  if (metCount === 5) return { label: 'Good', score: 75, className: 'bg-blue-500' };
  return { label: 'Strong', score: 100, className: 'bg-emerald-500' };
};

export const generateStrongPassword = (length = 18) => {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%&*?'
  ];
  const allCharacters = groups.join('');
  const randomIndex = (maximum: number) => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % maximum;
  };
  const characters = groups.map((group) => group[randomIndex(group.length)]);
  while (characters.length < Math.max(12, length)) {
    characters.push(allCharacters[randomIndex(allCharacters.length)]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
};
