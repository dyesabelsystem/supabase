import { supabase } from './supabaseClient';

export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
  [key: string]: any;
}

type ApiTarget = 'main' | 'users' | 'donations' | 'chatbot';
type Payload = Record<string, any>;

const CONTENT_ACTIONS: Record<string, { key: string; responseKey: string; write: boolean }> = {
  getOrgSettings: { key: 'org_settings', responseKey: 'settings', write: false },
  updateOrgSettings: { key: 'org_settings', responseKey: 'settings', write: true },
  loadLandingPage: { key: 'landing_page', responseKey: 'landingPage', write: false },
  saveLandingPage: { key: 'landing_page', responseKey: 'landingPage', write: true },
  loadPillars: { key: 'pillars', responseKey: 'pillars', write: false },
  listPillars: { key: 'pillars', responseKey: 'pillars', write: false },
  savePillars: { key: 'pillars', responseKey: 'pillars', write: true },
  loadPartners: { key: 'partners', responseKey: 'partners', write: false },
  listPartnerCategories: { key: 'partners', responseKey: 'partners', write: false },
  savePartners: { key: 'partners', responseKey: 'partners', write: true },
  loadFounders: { key: 'founders', responseKey: 'founders', write: false },
  listFounders: { key: 'founders', responseKey: 'founders', write: false },
  saveFounders: { key: 'founders', responseKey: 'founders', write: true },
  loadExecutiveOfficers: { key: 'executive_officers', responseKey: 'executiveOfficers', write: false },
  listExecutiveOfficers: { key: 'executive_officers', responseKey: 'executiveOfficers', write: false },
  saveExecutiveOfficers: { key: 'executive_officers', responseKey: 'executiveOfficers', write: true },
  loadStories: { key: 'stories', responseKey: 'stories', write: false },
  listStories: { key: 'stories', responseKey: 'stories', write: false },
  saveStories: { key: 'stories', responseKey: 'stories', write: true },
  getDonationContent: { key: 'donations', responseKey: 'donationContent', write: false },
  saveDonationContent: { key: 'donations', responseKey: 'donationContent', write: true }
};

const contentValue = (payload: Payload, responseKey: string) =>
  payload[responseKey] ?? payload.content ?? payload.settings;

const handleContentAction = async (payload: Payload, config: typeof CONTENT_ACTIONS[string]) => {
  if (config.write) {
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('site_content')
      .upsert({
        content_key: config.key,
        data: contentValue(payload, config.responseKey),
        updated_by: authData.user?.id ?? null,
        updated_at: new Date().toISOString()
      })
      .select('data')
      .single();
    if (error) throw error;
    return { success: true, [config.responseKey]: data.data };
  }

  const { data, error } = await supabase
    .from('site_content')
    .select('data')
    .eq('content_key', config.key)
    .single();
  if (error) throw error;
  return { success: true, [config.responseKey]: data.data };
};

const handleChapterAction = async (payload: Payload): Promise<ApiResponse> => {
  if (payload.action === 'listChapters') {
    const { data, error } = await supabase.from('chapters').select('data').order('sort_order');
    if (error) throw error;
    return { success: true, chapters: (data || []).map((row) => row.data) };
  }
  if (payload.action === 'loadChapter') {
    const { data, error } = await supabase.from('chapters').select('data').eq('id', payload.chapterId).single();
    if (error) throw error;
    return { success: true, chapter: data.data };
  }
  if (payload.action === 'saveChapter') {
    const { data: authData } = await supabase.auth.getUser();
    const chapter = { ...payload.chapterData, id: payload.chapterId };
    const { error } = await supabase.from('chapters').upsert({
      id: payload.chapterId,
      data: chapter,
      updated_by: authData.user?.id ?? null,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    return { success: true, chapter };
  }
  const { error } = await supabase.from('chapters').delete().eq('id', payload.chapterId);
  if (error) throw error;
  return { success: true };
};

const handleNewsletter = async (payload: Payload): Promise<ApiResponse> => {
  const { data, error } = await supabase.functions.invoke('application-email', {
    body: {
      action: 'subscribeNewsletter',
      email: String(payload.email || '').trim().toLowerCase(),
      source: String(payload.source || 'Website')
    }
  });
  if (error) throw error;
  return data as ApiResponse;
};

const handleAuthAction = async (payload: Payload): Promise<ApiResponse> => {
  if (payload.action === 'logout') {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  }
  if (payload.action === 'validateSession') {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) return { success: false, error: 'Session expired' };
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('legacy_user_id,username,email,role,chapter_id')
      .eq('auth_user_id', userData.user.id)
      .single();
    if (profileError) throw profileError;
    return { success: true, valid: true, user: mapProfile(profile) };
  }
  if (payload.action === 'login') {
    const identifier = String(payload.username || '').trim();
    if (!identifier.includes('@')) {
      return { success: false, error: 'Use your email address to sign in after the Supabase migration.' };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password: String(payload.password || '')
    });
    if (error || !data.user || !data.session) return { success: false, error: error?.message || 'Invalid credentials' };
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('legacy_user_id,username,email,role,chapter_id')
      .eq('auth_user_id', data.user.id)
      .single();
    if (profileError) throw profileError;
    return { success: true, sessionToken: data.session.access_token, user: mapProfile(profile) };
  }
  if (['listUsers', 'createUser', 'updateUser', 'deleteUser', 'updatePassword'].includes(payload.action)) {
    const { data, error } = await supabase.functions.invoke('user-admin', { body: payload });
    if (error) throw error;
    return data as ApiResponse;
  }
  if (payload.action === 'updateOwnProfile') {
    const attributes: { email?: string; password?: string; data?: Record<string, string> } = {
      email: payload.email,
      data: {
        username: payload.username,
        display_name: payload.username,
        full_name: payload.username,
        name: payload.username
      }
    };
    if (payload.newPassword) attributes.password = payload.newPassword;
    const { data: authData, error } = await supabase.auth.updateUser(attributes);
    if (error || !authData.user) throw error || new Error('Profile update failed.');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('legacy_user_id,username,email,role,chapter_id')
      .eq('auth_user_id', authData.user.id)
      .single();
    if (profileError) throw profileError;
    return { success: true, user: mapProfile(profile) };
  }
  return {
    success: false,
    error: 'Supabase Auth account administration is pending the protected Edge Function.'
  };
};

const mapProfile = (profile: any) => ({
  id: profile.legacy_user_id,
  username: profile.username,
  email: profile.email,
  role: profile.role,
  chapterId: profile.chapter_id || undefined
});

const handleChatbotTicket = async (payload: Payload): Promise<ApiResponse> => {
  const { data, error } = await supabase.functions.invoke('application-email', {
    body: {
      action: 'createSupportTicket',
      email: String(payload.email || '').trim().toLowerCase(),
      messages: payload.messages || [],
      context: payload.context || {}
    }
  });
  if (error) throw error;
  return data as ApiResponse;
};

const handleCollectionAction = async (payload: Payload): Promise<ApiResponse | null> => {
  const match = String(payload.action || '').match(/^(get|create|update|delete)(Pillar|Founder|ExecutiveOfficer|Story)$/);
  if (!match) return null;
  const [, operation, entity] = match;
  const config: Record<string, { key: string; itemKey: string; idKey: string; responseKey: string }> = {
    Pillar: { key: 'pillars', itemKey: 'pillar', idKey: 'pillarId', responseKey: 'pillar' },
    Founder: { key: 'founders', itemKey: 'founder', idKey: 'founderId', responseKey: 'founder' },
    ExecutiveOfficer: { key: 'executive_officers', itemKey: 'executiveOfficer', idKey: 'executiveOfficerId', responseKey: 'executiveOfficer' },
    Story: { key: 'stories', itemKey: 'story', idKey: 'storyId', responseKey: 'story' }
  };
  const selected = config[entity];
  const { data: row, error } = await supabase.from('site_content').select('data').eq('content_key', selected.key).single();
  if (error) throw error;
  const items = Array.isArray(row.data) ? [...row.data] : [];
  const incoming = payload[selected.itemKey];
  const id = String(payload[selected.idKey] || incoming?.id || '');
  const index = items.findIndex((item: any) => String(item?.id) === id);
  if (operation === 'get') return index >= 0 ? { success: true, [selected.responseKey]: items[index] } : { success: false, error: `${entity} not found.` };
  if (!incoming && operation !== 'delete') return { success: false, error: `${entity} data is required.` };
  if (operation === 'create') {
    if (!id) return { success: false, error: `${entity} ID is required.` };
    if (index >= 0) return { success: false, error: `${entity} already exists.` };
    items.push(incoming);
  }
  if (operation === 'update') {
    if (index < 0) return { success: false, error: `${entity} not found.` };
    items[index] = incoming;
  }
  if (operation === 'delete') {
    if (index < 0) return { success: false, error: `${entity} not found.` };
    items.splice(index, 1);
  }
  const { error: updateError } = await supabase.from('site_content').update({ data: items, updated_at: new Date().toISOString() }).eq('content_key', selected.key);
  if (updateError) throw updateError;
  return { success: true, [selected.responseKey]: incoming };
};

const handlePartnerAction = async (payload: Payload): Promise<ApiResponse | null> => {
  if (!/^(get|create|update|delete)Partner(Category)?$/.test(String(payload.action || ''))) return null;
  const { data: row, error } = await supabase.from('site_content').select('data').eq('content_key', 'partners').single();
  if (error) throw error;
  const categories: any[] = Array.isArray(row.data) ? structuredClone(row.data) : [];
  const action = String(payload.action);
  let categoryId = String(payload.categoryId || payload.category?.id || '');
  let categoryIndex = categories.findIndex((category) => String(category?.id) === categoryId);
  if (action === 'getPartner' && categoryIndex < 0 && payload.partnerId) {
    categoryIndex = categories.findIndex((category) =>
      Array.isArray(category?.partners)
      && category.partners.some((partner: any) => String(partner?.id) === String(payload.partnerId))
    );
    categoryId = categoryIndex >= 0 ? String(categories[categoryIndex]?.id || '') : '';
  }
  if (action === 'getPartnerCategory') return categoryIndex >= 0 ? { success: true, category: categories[categoryIndex] } : { success: false, error: 'Category not found.' };
  if (action.endsWith('PartnerCategory')) {
    if (!categoryId) return { success: false, error: 'Category ID is required.' };
    if (action === 'createPartnerCategory') {
      if (categoryIndex >= 0) return { success: false, error: 'Category already exists.' };
      categories.push(payload.category);
    }
    if (action === 'updatePartnerCategory') {
      if (categoryIndex < 0) return { success: false, error: 'Category not found.' };
      categories[categoryIndex] = payload.category;
    }
    if (action === 'deletePartnerCategory') {
      if (categoryIndex < 0) return { success: false, error: 'Category not found.' };
      categories.splice(categoryIndex, 1);
    }
  } else {
    if (categoryIndex < 0) return { success: false, error: 'Category not found.' };
    const partners = Array.isArray(categories[categoryIndex].partners) ? categories[categoryIndex].partners : [];
    const partnerId = String(payload.partnerId || payload.partner?.id || '');
    const partnerIndex = partners.findIndex((partner: any) => String(partner?.id) === partnerId);
    if (action === 'getPartner') return partnerIndex >= 0 ? { success: true, partner: partners[partnerIndex], categoryId } : { success: false, error: 'Partner not found.' };
    if (!partnerId) return { success: false, error: 'Partner ID is required.' };
    if (action === 'createPartner') {
      if (partnerIndex >= 0) return { success: false, error: 'Partner already exists.' };
      partners.push(payload.partner);
    }
    if (action === 'updatePartner') {
      if (partnerIndex < 0) return { success: false, error: 'Partner not found.' };
      partners[partnerIndex] = payload.partner;
    }
    if (action === 'deletePartner') {
      if (partnerIndex < 0) return { success: false, error: 'Partner not found.' };
      partners.splice(partnerIndex, 1);
    }
    categories[categoryIndex].partners = partners;
  }
  const { error: updateError } = await supabase.from('site_content').update({ data: categories, updated_at: new Date().toISOString() }).eq('content_key', 'partners');
  if (updateError) throw updateError;
  return { success: true };
};

export const sendApiRequest = async <T>(
  _target: ApiTarget,
  payload: object
): Promise<ApiResponse<T>> => {
  const request = payload as Payload;
  try {
    const contentAction = CONTENT_ACTIONS[String(request.action || '')];
    if (contentAction) return await handleContentAction(request, contentAction);
    const collectionResult = await handleCollectionAction(request);
    if (collectionResult) return collectionResult;
    const partnerResult = await handlePartnerAction(request);
    if (partnerResult) return partnerResult;
    if (['listChapters', 'loadChapter', 'saveChapter', 'deleteChapter'].includes(request.action)) {
      return await handleChapterAction(request);
    }
    if (request.action === 'subscribeNewsletter') return await handleNewsletter(request);
    if (['login', 'logout', 'validateSession', 'listUsers', 'createUser', 'updateUser', 'deleteUser', 'updatePassword', 'updateOwnProfile', 'register'].includes(request.action)) {
      return await handleAuthAction(request);
    }
    if (request.action === 'getPublicDonationData') {
      const result = await handleContentAction(request, CONTENT_ACTIONS.getDonationContent);
      return { success: true, data: result.donationContent };
    }
    if (request.action === 'chatbotCreateTicket') return await handleChatbotTicket(request);
    if (request.action === 'chatbotAsk') {
      const { data, error } = await supabase.functions.invoke('chatbot', { body: request });
      if (error) throw error;
      return data as ApiResponse<T>;
    }
    if (['uploadImage', 'getImage', 'updateImage', 'replaceImage', 'restoreImage', 'listImages', 'deleteImage', 'uploadDonationQr', 'downloadDonationQr'].includes(request.action)) {
      const driveActionMap: Record<string, string> = {
        uploadImage: 'upload',
        uploadDonationQr: 'upload',
        getImage: 'get',
        updateImage: 'update',
        replaceImage: 'replace',
        restoreImage: 'restore',
        listImages: 'list',
        deleteImage: 'delete',
        downloadDonationQr: 'download'
      };
      const driveAction = driveActionMap[request.action];
      if (!driveAction) return { success: false, error: `Drive action ${request.action} is not supported.` };
      const { data, error } = await supabase.functions.invoke('drive-images', {
        body: {
          ...request,
          action: driveAction,
          base64: request.fileData,
          mimeType: request.fileType,
          fileId: request.fileId
        }
      });
      if (error) throw error;
      return data as ApiResponse<T>;
    }
    return { success: false, error: `Unsupported Supabase action: ${String(request.action || '')}` };
  } catch (error) {
    console.error('[supabase] Request failed', { action: request.action, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Supabase request failed.'
    };
  }
};
