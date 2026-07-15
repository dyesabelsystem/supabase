const readEnv = (key: string): string => {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

export const APP_CONFIG = {
  supabaseUrl: readEnv('VITE_SUPABASE_URL'),
  supabasePublishableKey: readEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
  driveImageApiUrl: readEnv('VITE_DRIVE_IMAGE_API_URL'),
  chatbotGasUrl: readEnv('VITE_CHATBOT_GAS_URL') || readEnv('VITE_DRIVE_IMAGE_API_URL'),
  organizationName: readEnv('VITE_ORGANIZATION_NAME') || 'DYESABEL PH Inc.',
  supportEmail: readEnv('VITE_SUPPORT_EMAIL') || 'projectdyesabel@gmail.com',
  supportPhone: readEnv('VITE_SUPPORT_PHONE'),
  supportLocation: readEnv('VITE_SUPPORT_LOCATION') || 'Davao, Philippines',
  volunteerUrl: readEnv('VITE_VOLUNTEER_URL') || 'https://forms.gle/W6WVpftGDwM7fUm19',
  logoUrl: readEnv('VITE_LOGO_URL') || '/icons/apple-touch-icon.png',
};

export const requireConfig = (value: string, label: string): string => {
  if (!value) {
    throw new Error(`${label} is not configured.`);
  }
  return value;
};
