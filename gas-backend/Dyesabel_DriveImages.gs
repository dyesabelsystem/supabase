/**
 * DYESABEL Drive image backend.
 *
 * Deploy this file as the only Code.gs/doGet/doPost implementation in the
 * dedicated image Apps Script project:
 * https://script.google.com/macros/s/AKfycbxxPZrdueZqgBRGmhgmCQlQykRxYMkzyc42mVIdqi6PbE92NpRj8AmjFmqeBj8deoMV/exec
 *
 * Script Property required for protected CRUD:
 *   DRIVE_CRUD_SECRET = a long random value (also configure it in Supabase)
 * Script Property required for authentication email delivery:
 *   AUTH_EMAIL_GAS_SECRET = a different long random value (also configure it in Supabase)
 */
var DYESABEL_DRIVE_FOLDER_ID = '1Tyxxi0If1jysxtdpVUxoX7-fYaRJVsPD';
var DYESABEL_CRUD_SECRET_PROPERTY = 'DRIVE_CRUD_SECRET';
var DYESABEL_EMAIL_SECRET_PROPERTY = 'AUTH_EMAIL_GAS_SECRET';
var DYESABEL_ORGANIZATION_NAME = 'DYESABEL PH Inc.';
var DYESABEL_LEGAL_NAME = 'Developing the Youth with Environmentally Sustainable Advocacies Building and Empowering Lives Philippines, Inc.';
var DYESABEL_SEC_REGISTRATION_ID = '2023040094046-98';
var DYESABEL_SITE_URL = 'https://www.dyesabelph.org';
var DYESABEL_LOGO_URL = DYESABEL_SITE_URL + '/icons/apple-touch-icon.png';
var DYESABEL_SUPPORT_EMAIL = 'projectdyesabel@gmail.com';
var DYESABEL_FACEBOOK_URL = 'https://www.facebook.com/dyesabel.ph';
var DYESABEL_INSTAGRAM_URL = 'https://www.instagram.com/dyesabel.ph/';
var DYESABEL_DEFAULT_LIST_LIMIT = 50;
var DYESABEL_MAX_LIST_LIMIT = 200;
var DYESABEL_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
var DYESABEL_ALLOWED_IMAGE_TYPES = {
  'image/jpeg': true,
  'image/png': true,
  'image/gif': true,
  'image/webp': true
};

function doPost(e) {
  try {
    var data = dyesabelParseDriveRequest_(e);
    var action = String(data.action || 'upload').toLowerCase();

    if (action === 'sendauthemail') {
      dyesabelRequireEmailSecret_(data.secret);
      return dyesabelJson_(dyesabelSendAuthEmail_(data));
    }
    if (action === 'sendapplicationemail') {
      dyesabelRequireEmailSecret_(data.secret);
      return dyesabelJson_(dyesabelSendApplicationEmail_(data));
    }

    dyesabelRequireCrudSecret_(data.secret);

    if (action === 'upload' || action === 'uploadimage') return dyesabelJson_(dyesabelUploadImage_(data));
    if (action === 'get' || action === 'read') return dyesabelJson_(dyesabelGetImage_(data));
    if (action === 'download') return dyesabelJson_(dyesabelDownloadImage_(data));
    if (action === 'list' || action === 'listimages') return dyesabelJson_(dyesabelListImages_(data));
    if (action === 'update' || action === 'rename') return dyesabelJson_(dyesabelUpdateImage_(data));
    if (action === 'replace') return dyesabelJson_(dyesabelReplaceImage_(data));
    if (action === 'delete' || action === 'deleteimage') return dyesabelJson_(dyesabelDeleteImage_(data));
    if (action === 'restore') return dyesabelJson_(dyesabelRestoreImage_(data));
    if (action === 'check' || action === 'diagnostics') return dyesabelJson_(dyesabelCheckDriveConnection_(data.writeTest === true));

    throw new Error('Unsupported Drive action: ' + action);
  } catch (error) {
    return dyesabelJson_({ success: false, error: String(error && error.message ? error.message : error) });
  }
}

/**
 * Sends an authentication email forwarded by the verified Supabase Send Email
 * Hook. Never call this action directly from a browser.
 */
function dyesabelSendAuthEmail_(data) {
  var recipient = String(data.to || '').trim().toLowerCase();
  var emailData = data.emailData || {};
  var actionType = String(emailData.email_action_type || '').toLowerCase();
  var token = String(emailData.token || '').trim();
  var tokenHash = String(emailData.token_hash || '').trim();
  var redirectTo = dyesabelAllowedRedirect_(emailData.redirect_to);

  if (!dyesabelIsEmail_(recipient)) throw new Error('A valid recipient email is required.');
  if (!actionType) throw new Error('Missing authentication email action type.');

  var referenceId = dyesabelEmailReferenceId_(actionType);
  var content = dyesabelAuthEmailContent_(actionType, token, tokenHash, redirectTo);
  var htmlBody = dyesabelEmailLayout_(content, referenceId);
  var plainBody = dyesabelPlainTextEmail_(content, referenceId);

  MailApp.sendEmail({
    to: recipient,
    subject: content.subject,
    body: plainBody,
    htmlBody: htmlBody,
    name: DYESABEL_ORGANIZATION_NAME,
    replyTo: DYESABEL_SUPPORT_EMAIL
  });

  return { success: true, action: 'sendAuthEmail', referenceId: referenceId };
}

/**
 * Sends a pre-rendered application notification prepared by the protected
 * application-email Edge Function. Content remains plain text and is escaped
 * by the shared layout, so callers cannot inject markup.
 */
function dyesabelSendApplicationEmail_(data) {
  var recipient = String(data.to || '').trim().toLowerCase();
  var content = data.content || {};
  var template = String(data.template || 'notification').toLowerCase();
  if (!dyesabelIsEmail_(recipient)) throw new Error('A valid recipient email is required.');
  if (!String(content.subject || '').trim()) throw new Error('Email subject is required.');
  if (!String(content.title || '').trim()) throw new Error('Email title is required.');

  var referenceId = dyesabelEmailReferenceId_(template);
  var normalized = {
    subject: String(content.subject).slice(0, 140),
    eyebrow: String(content.eyebrow || 'DYESABEL PH UPDATE').slice(0, 80),
    title: String(content.title).slice(0, 160),
    message: String(content.message || '').slice(0, 4000),
    detail: String(content.detail || '').slice(0, 4000),
    buttonLabel: String(content.buttonLabel || '').slice(0, 50),
    actionUrl: dyesabelSafePublicUrl_(content.actionUrl),
    token: '',
    warning: String(content.warning || '').slice(0, 2000),
    disclaimer: String(content.disclaimer || 'This automated message was sent because of an interaction with the official DYESABEL PH website.').slice(0, 1000),
    details: dyesabelNormalizeEmailDetails_(content.details)
  };

  MailApp.sendEmail({
    to: recipient,
    subject: normalized.subject,
    body: dyesabelPlainTextEmail_(normalized, referenceId),
    htmlBody: dyesabelEmailLayout_(normalized, referenceId),
    name: DYESABEL_ORGANIZATION_NAME,
    replyTo: String(data.replyTo || DYESABEL_SUPPORT_EMAIL)
  });

  return { success: true, action: 'sendApplicationEmail', template: template, referenceId: referenceId };
}

function dyesabelAuthEmailContent_(actionType, token, tokenHash, redirectTo) {
  var verifyType = actionType === 'magiclink' ? 'magiclink' : actionType;
  var actionUrl = tokenHash
    ? 'https://rtmpjojqzfrggmmlseam.supabase.co/auth/v1/verify?token=' +
      encodeURIComponent(tokenHash) + '&type=' + encodeURIComponent(verifyType) +
      '&redirect_to=' + encodeURIComponent(redirectTo)
    : '';

  if (actionType === 'recovery') {
    return {
      subject: 'Reset your DYESABEL PH password',
      eyebrow: 'ACCOUNT SECURITY',
      title: 'Reset your password',
      message: 'We received a request to reset the password for your DYESABEL PH account.',
      detail: 'Use the secure button below to create a new password. This link is time-limited and can only be used once.',
      buttonLabel: 'Reset password',
      actionUrl: actionUrl,
      token: token,
      warning: 'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.'
    };
  }

  if (actionType === 'password_changed_notification') {
    return {
      subject: 'Your DYESABEL PH password was changed',
      eyebrow: 'SECURITY NOTICE',
      title: 'Password changed',
      message: 'The password for your DYESABEL PH account was changed successfully.',
      detail: 'No further action is needed if you made this change.',
      buttonLabel: '',
      actionUrl: '',
      token: '',
      warning: 'If you did not make this change, contact us immediately at ' + DYESABEL_SUPPORT_EMAIL + '.'
    };
  }

  var labels = {
    signup: ['Verify your DYESABEL PH email', 'Verify your email address'],
    invite: ['You are invited to DYESABEL PH', 'Accept your invitation'],
    magiclink: ['Your DYESABEL PH sign-in code', 'Sign in securely'],
    email: ['Your DYESABEL PH verification code', 'Verify your identity'],
    reauthentication: ['Confirm your DYESABEL PH identity', 'Confirm your identity'],
    email_change: ['Confirm your DYESABEL PH email change', 'Confirm your new email']
  };
  var label = labels[actionType] || ['DYESABEL PH account verification', 'Verify your account'];
  return {
    subject: label[0],
    eyebrow: 'EMAIL VERIFICATION',
    title: label[1],
    message: 'Use this one-time verification code to continue with your DYESABEL PH account.',
    detail: 'For your security, this code expires shortly and should never be shared with anyone.',
    buttonLabel: actionUrl ? 'Continue securely' : '',
    actionUrl: actionUrl,
    token: token,
    warning: 'If you did not request this email, you can safely ignore it. Do not share this code with anyone.'
  };
}

function dyesabelEmailLayout_(content, referenceId) {
  var button = content.actionUrl && content.buttonLabel
    ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 0 8px">' +
      '<a href="' + dyesabelEscapeHtml_(content.actionUrl) + '" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:10px">' +
      dyesabelEscapeHtml_(content.buttonLabel) + '</a></td></tr></table>'
    : '';
  var code = content.token
    ? '<div style="margin:26px 0 4px;padding:18px 12px;border:1px solid #a5f3fc;border-radius:12px;background:#ecfeff;text-align:center">' +
      '<div style="color:#0e7490;font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase">One-time code</div>' +
      '<div style="padding-top:7px;color:#051923;font-family:Consolas,Monaco,monospace;font-size:32px;font-weight:800;letter-spacing:8px">' +
      dyesabelEscapeHtml_(content.token) + '</div></div>'
    : '';
  var details = content.details && content.details.length
    ? '<div style="margin-top:24px;border:1px solid #dbe8ec;border-radius:12px;overflow:hidden">' +
      content.details.map(function (item, index) {
        return '<div style="padding:11px 14px;' + (index ? 'border-top:1px solid #dbe8ec;' : '') +
          'background:' + (index % 2 ? '#ffffff' : '#f7fafb') + '">' +
          '<span style="display:inline-block;min-width:130px;color:#647b88;font-size:12px;font-weight:700">' +
          dyesabelEscapeHtml_(item.label) + '</span>' +
          '<span style="color:#243746;font-size:13px">' + dyesabelEscapeHtml_(item.value) + '</span></div>';
      }).join('') + '</div>'
    : '';
  var warning = content.warning
    ? '<div style="margin-top:28px;padding:16px 18px;border-left:4px solid #22d3ee;background:#f4fbfc;color:#4b6473;font-size:13px;line-height:1.55">' +
      dyesabelEscapeHtml_(content.warning) + '</div>'
    : '';
  var disclaimer = content.disclaimer ||
    'This is an automated account-security email intended only for its recipient. Please do not reply with passwords, verification codes, or other sensitive information.';

  return '<!doctype html><html><body style="margin:0;padding:0;background:#eef6f8;font-family:Arial,Helvetica,sans-serif;color:#243746">' +
    '<div style="display:none;max-height:0;overflow:hidden">' + dyesabelEscapeHtml_(content.message) + '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef6f8"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 35px rgba(5,25,35,.10)">' +
    '<tr><td style="padding:28px 34px;background:#051923;border-bottom:4px solid #22d3ee">' +
    '<table role="presentation" cellspacing="0" cellpadding="0"><tr>' +
    '<td style="padding-right:14px"><img src="' + DYESABEL_LOGO_URL + '" width="64" height="64" alt="DYESABEL PH Inc. logo" style="display:block;border-radius:50%;background:#ffffff"></td>' +
    '<td><div style="color:#22d3ee;font-size:11px;font-weight:700;letter-spacing:1.5px">ENVIRONMENT • YOUTH • COMMUNITY</div>' +
    '<div style="padding-top:5px;color:#ffffff;font-size:23px;font-weight:800">' + DYESABEL_ORGANIZATION_NAME + '</div></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:38px 38px 30px">' +
    '<div style="color:#2563eb;font-size:11px;font-weight:800;letter-spacing:1.6px">' + dyesabelEscapeHtml_(content.eyebrow) + '</div>' +
    '<h1 style="margin:9px 0 16px;color:#051923;font-size:28px;line-height:1.25">' + dyesabelEscapeHtml_(content.title) + '</h1>' +
    '<p style="margin:0 0 12px;font-size:16px;line-height:1.65">' + dyesabelEscapeHtml_(content.message) + '</p>' +
    '<p style="margin:0;color:#5b7080;font-size:14px;line-height:1.65">' + dyesabelEscapeHtml_(content.detail) + '</p>' +
    code + details + button + warning +
    '</td></tr>' +
    '<tr><td style="padding:26px 34px;background:#f7fafb;border-top:1px solid #dbe8ec">' +
    '<div style="color:#8a9ba5;font-size:10px;line-height:1.5">Email reference ID: <strong>' +
    dyesabelEscapeHtml_(referenceId) + '</strong></div>' +
    '<div style="padding-top:10px;color:#8a9ba5;font-size:10px;line-height:1.5">' +
    dyesabelEscapeHtml_(disclaimer) + '</div>' +
    '<div style="padding-top:18px;color:#051923;font-size:13px;font-weight:700">Connect with DYESABEL PH</div>' +
    '<div style="padding-top:9px;font-size:13px;line-height:1.8">' +
    '<a href="' + DYESABEL_FACEBOOK_URL + '" style="color:#2563eb;text-decoration:none">Facebook</a>&nbsp;&nbsp;•&nbsp;&nbsp;' +
    '<a href="' + DYESABEL_INSTAGRAM_URL + '" style="color:#2563eb;text-decoration:none">Instagram</a>&nbsp;&nbsp;•&nbsp;&nbsp;' +
    '<a href="mailto:' + DYESABEL_SUPPORT_EMAIL + '" style="color:#2563eb;text-decoration:none">' + DYESABEL_SUPPORT_EMAIL + '</a></div>' +
    '<div style="padding-top:18px;color:#647b88;font-size:11px;line-height:1.6">' +
    '<strong>About DYESABEL PH Inc.</strong><br>' + DYESABEL_LEGAL_NAME + '<br>' +
    'SEC Registration ID: ' + DYESABEL_SEC_REGISTRATION_ID + '<br>Davao, Philippines</div>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function dyesabelPlainTextEmail_(content, referenceId) {
  var lines = [
    DYESABEL_ORGANIZATION_NAME,
    content.title,
    '',
    content.message,
    content.detail
  ];
  if (content.token) lines.push('', 'One-time code: ' + content.token);
  if (content.details && content.details.length) {
    lines.push('');
    content.details.forEach(function (item) {
      lines.push(item.label + ': ' + item.value);
    });
  }
  if (content.actionUrl) lines.push('', content.buttonLabel + ': ' + content.actionUrl);
  lines.push('', content.warning, '', 'Contact: ' + DYESABEL_SUPPORT_EMAIL);
  lines.push(DYESABEL_LEGAL_NAME);
  lines.push('SEC Registration ID: ' + DYESABEL_SEC_REGISTRATION_ID);
  lines.push('Email reference ID: ' + referenceId);
  return lines.join('\n');
}

function dyesabelNormalizeEmailDetails_(details) {
  if (!Array.isArray(details)) return [];
  return details.slice(0, 20).map(function (item) {
    return {
      label: String(item && item.label || '').trim().slice(0, 80),
      value: String(item && item.value || '').trim().slice(0, 1000)
    };
  }).filter(function (item) {
    return item.label && item.value;
  });
}

function dyesabelSafePublicUrl_(value) {
  var candidate = String(value || '').trim();
  return /^https:\/\/[a-z0-9.-]+(?:[/?#]|$)/i.test(candidate) ? candidate.slice(0, 2000) : '';
}

function dyesabelEmailReferenceId_(actionType) {
  var stamp = Utilities.formatDate(new Date(), 'Asia/Manila', 'yyyyMMdd-HHmmss');
  return 'DYESABEL-' + String(actionType || 'AUTH').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) +
    '-' + stamp + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
}

function dyesabelAllowedRedirect_(value) {
  var candidate = String(value || '').trim();
  if (/^https:\/\/(www\.)?dyesabelph\.org(?:[/?#]|$)/i.test(candidate)) return candidate;
  if (/^http:\/\/localhost(?::\d+)?(?:[/?#]|$)/i.test(candidate)) return candidate;
  return DYESABEL_SITE_URL + '/reset-password';
}

function dyesabelIsEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function dyesabelEscapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function doGet(e) {
  var action = String(e && e.parameter ? e.parameter.action || '' : '').toLowerCase();
  try {
    if (action === 'check' || action === 'diagnostics') {
      return dyesabelJson_(dyesabelCheckDriveConnection_(String(e.parameter.write || '') === '1'));
    }
    if (action === 'get' || action === 'read' || action === 'list') {
      dyesabelRequireCrudSecret_(e.parameter.secret);
      return dyesabelJson_(action === 'list' ? dyesabelListImages_(e.parameter) : dyesabelGetImage_(e.parameter));
    }
    return dyesabelJson_({
      success: true,
      service: 'DYESABEL Drive Images',
      folderId: DYESABEL_DRIVE_FOLDER_ID,
      diagnostics: '?action=check',
      writeDiagnostics: '?action=check&write=1'
    });
  } catch (error) {
    return dyesabelJson_({ success: false, error: String(error && error.message ? error.message : error) });
  }
}

function setupDriveImageBackend() {
  return dyesabelCheckDriveConnection_(true);
}

function dyesabelParseDriveRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) throw new Error('No JSON payload received.');
  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('Invalid JSON payload.');
  }
}

function dyesabelUploadImage_(data) {
  var base64 = String(data.base64 || data.fileData || '').replace(/^data:[^,]+,/, '');
  var fileName = dyesabelSafeFileName_(data.fileName || 'uploaded-image');
  var mimeType = String(data.mimeType || data.fileType || '').toLowerCase();
  if (!base64) throw new Error('Missing image data.');
  if (!DYESABEL_ALLOWED_IMAGE_TYPES[mimeType]) throw new Error('Unsupported image type: ' + mimeType);

  var bytes = Utilities.base64Decode(base64);
  if (bytes.length > DYESABEL_MAX_IMAGE_BYTES) throw new Error('Image exceeds the 10 MB limit.');

  var file = DriveApp.getFolderById(DYESABEL_DRIVE_FOLDER_ID)
    .createFile(Utilities.newBlob(bytes, mimeType, fileName));
  var warning = dyesabelMakePublic_(file);
  var response = dyesabelFileToJson_(file);
  response.success = true;
  response.action = 'upload';
  response.sharingWarning = warning;
  return response;
}

function dyesabelGetImage_(data) {
  return { success: true, action: 'get', file: dyesabelFileToJson_(dyesabelGetManagedFile_(data.fileId)) };
}

function dyesabelDownloadImage_(data) {
  var file = dyesabelGetManagedFile_(data.fileId);
  var blob = file.getBlob();
  return {
    success: true,
    action: 'download',
    fileId: file.getId(),
    fileName: file.getName(),
    fileType: blob.getContentType(),
    fileData: Utilities.base64Encode(blob.getBytes())
  };
}

function dyesabelListImages_(data) {
  var iterator = DriveApp.getFolderById(DYESABEL_DRIVE_FOLDER_ID).getFiles();
  var limit = Math.min(Math.max(Number(data.limit || DYESABEL_DEFAULT_LIST_LIMIT), 1), DYESABEL_MAX_LIST_LIMIT);
  var items = [];
  while (iterator.hasNext() && items.length < limit) {
    var file = iterator.next();
    if (!file.isTrashed() && DYESABEL_ALLOWED_IMAGE_TYPES[String(file.getMimeType()).toLowerCase()]) {
      items.push(dyesabelFileToJson_(file));
    }
  }
  return { success: true, action: 'list', count: items.length, limit: limit, items: items, files: items };
}

function dyesabelUpdateImage_(data) {
  var file = dyesabelGetManagedFile_(data.fileId);
  if (data.fileName) file.setName(dyesabelSafeFileName_(data.fileName));
  if (typeof data.description !== 'undefined') file.setDescription(String(data.description || '').slice(0, 500));
  var warning = '';
  if (data.makePublic === true || String(data.makePublic).toLowerCase() === 'true') warning = dyesabelMakePublic_(file);
  return { success: true, action: 'update', file: dyesabelFileToJson_(file), sharingWarning: warning };
}

function dyesabelReplaceImage_(data) {
  var oldFile = dyesabelGetManagedFile_(data.fileId);
  var replacement = dyesabelUploadImage_(data);
  oldFile.setTrashed(true);
  replacement.action = 'replace';
  replacement.replacedFileId = oldFile.getId();
  return replacement;
}

function dyesabelDeleteImage_(data) {
  var file = dyesabelGetManagedFile_(data.fileId);
  file.setTrashed(true);
  return { success: true, action: 'delete', fileId: file.getId(), trashed: true };
}

function dyesabelRestoreImage_(data) {
  var file = DriveApp.getFileById(dyesabelValidateFileId_(data.fileId));
  if (!dyesabelIsInManagedFolder_(file)) throw new Error('File is outside the configured Drive folder.');
  file.setTrashed(false);
  return { success: true, action: 'restore', file: dyesabelFileToJson_(file) };
}

function dyesabelGetManagedFile_(fileId) {
  var file = DriveApp.getFileById(dyesabelValidateFileId_(fileId));
  if (!DYESABEL_ALLOWED_IMAGE_TYPES[String(file.getMimeType()).toLowerCase()]) throw new Error('File is not an allowed image type.');
  if (!dyesabelIsInManagedFolder_(file)) throw new Error('File is outside the configured Drive folder.');
  return file;
}

function dyesabelValidateFileId_(fileId) {
  var value = String(fileId || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(value)) throw new Error('Invalid or missing fileId.');
  return value;
}

function dyesabelIsInManagedFolder_(file) {
  var parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === DYESABEL_DRIVE_FOLDER_ID) return true;
  return false;
}

function dyesabelFileToJson_(file) {
  var id = file.getId();
  return {
    fileId: id,
    fileName: file.getName(),
    name: file.getName(),
    mimeType: file.getMimeType(),
    fileType: file.getMimeType(),
    size: file.getSize(),
    description: file.getDescription(),
    createdAt: file.getDateCreated().toISOString(),
    updatedAt: file.getLastUpdated().toISOString(),
    trashed: file.isTrashed(),
    fileUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w4000',
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w4000',
    url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w4000',
    webViewLink: 'https://drive.google.com/file/d/' + id + '/view?usp=sharing'
  };
}

function dyesabelMakePublic_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return '';
  } catch (error) {
    return String(error);
  }
}

function dyesabelSafeFileName_(value) {
  return String(value).replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'uploaded-image';
}

function dyesabelRequireCrudSecret_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty(DYESABEL_CRUD_SECRET_PROPERTY);
  if (!expected) throw new Error('Set Script Property ' + DYESABEL_CRUD_SECRET_PROPERTY + ' before using Drive CRUD.');
  if (!provided || String(provided) !== expected) throw new Error('Unauthorized Drive CRUD request.');
}

function dyesabelRequireEmailSecret_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty(DYESABEL_EMAIL_SECRET_PROPERTY);
  if (!expected) throw new Error('Set Script Property ' + DYESABEL_EMAIL_SECRET_PROPERTY + ' before sending auth email.');
  if (!provided || String(provided) !== expected) throw new Error('Unauthorized authentication email request.');
}

function dyesabelCheckDriveConnection_(writeTest) {
  var result = {
    success: false,
    checkedAt: new Date().toISOString(),
    webAppConnection: true,
    folderId: DYESABEL_DRIVE_FOLDER_ID,
    checks: {
      driveAppAccessible: false,
      folderReadable: false,
      folderWritable: false,
      publicSharingAllowed: false,
      crudSecretConfigured: false,
      cleanupSucceeded: null
    },
    folderName: '',
    testFileId: '',
    errors: [],
    warnings: []
  };
  try {
    DriveApp.getRootFolder();
    result.checks.driveAppAccessible = true;
  } catch (error) {
    result.errors.push('DriveApp unavailable: ' + error);
  }
  result.checks.crudSecretConfigured = Boolean(
    PropertiesService.getScriptProperties().getProperty(DYESABEL_CRUD_SECRET_PROPERTY)
  );
  var folder = null;
  try {
    folder = DriveApp.getFolderById(DYESABEL_DRIVE_FOLDER_ID);
    result.folderName = folder.getName();
    result.checks.folderReadable = true;
  } catch (error) {
    result.errors.push('Folder unavailable: ' + error);
  }
  if (folder && writeTest) {
    var testFile = null;
    try {
      testFile = folder.createFile(Utilities.newBlob('connection test', 'text/plain', 'dyesabel-drive-check-' + Date.now() + '.txt'));
      result.testFileId = testFile.getId();
      result.checks.folderWritable = true;
      try {
        testFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        result.checks.publicSharingAllowed = true;
      } catch (sharingError) {
        result.warnings.push('Public sharing unavailable: ' + sharingError);
      }
      testFile.setTrashed(true);
      result.checks.cleanupSucceeded = true;
    } catch (error) {
      result.errors.push('Write test failed: ' + error);
      if (testFile) result.warnings.push('Delete test file manually: ' + testFile.getId());
    }
  }
  result.success = result.checks.driveAppAccessible && result.checks.folderReadable &&
    (!writeTest || result.checks.folderWritable) && result.checks.crudSecretConfigured;
  return result;
}

function dyesabelJson_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
