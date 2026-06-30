/**
 * DYESABEL Drive image backend.
 *
 * Deploy this file as the only Code.gs/doGet/doPost implementation in the
 * dedicated image Apps Script project:
 * https://script.google.com/macros/s/AKfycbxxPZrdueZqgBRGmhgmCQlQykRxYMkzyc42mVIdqi6PbE92NpRj8AmjFmqeBj8deoMV/exec
 *
 * Script Property required for protected CRUD:
 *   DRIVE_CRUD_SECRET = a long random value (also configure it in Supabase)
 */
var DYESABEL_DRIVE_FOLDER_ID = '1Tyxxi0If1jysxtdpVUxoX7-fYaRJVsPD';
var DYESABEL_CRUD_SECRET_PROPERTY = 'DRIVE_CRUD_SECRET';
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
