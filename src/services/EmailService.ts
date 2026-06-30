import { supabase } from './supabaseClient';

export interface EmailDetail {
  label: string;
  value: string;
}

interface NotificationFields {
  subject?: string;
  eyebrow?: string;
  title?: string;
  message: string;
  detail?: string;
  warning?: string;
  buttonLabel?: string;
  actionUrl?: string;
  details?: EmailDetail[];
}

type AdminTemplate = 'donation_receipt' | 'partnership_confirmation' | 'general_notification';

const sendAdminNotification = async (
  template: AdminTemplate,
  to: string,
  fields: NotificationFields
): Promise<{ success: boolean; referenceId?: string; error?: string }> => {
  const { data, error } = await supabase.functions.invoke('application-email', {
    body: { action: 'sendAdminNotification', template, to, fields }
  });
  if (error) return { success: false, error: error.message };
  return data;
};

export const EmailService = {
  sendDonationReceipt: (
    to: string,
    fields: NotificationFields
  ) => sendAdminNotification('donation_receipt', to, fields),

  sendPartnershipConfirmation: (
    to: string,
    fields: NotificationFields
  ) => sendAdminNotification('partnership_confirmation', to, fields),

  sendNotification: (
    to: string,
    fields: NotificationFields
  ) => sendAdminNotification('general_notification', to, fields)
};
