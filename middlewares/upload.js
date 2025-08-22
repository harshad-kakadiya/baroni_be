import multer from 'multer';

const storage = multer.memoryStorage();

const imageOnlyFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image uploads are allowed'));
  }
};

const videoOnlyFilter = (_req, file, cb) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video uploads are allowed'));
  }
};

export const upload = multer({ storage, fileFilter: imageOnlyFilter, limits: { fileSize: 5 * 1024 * 1024 } });
export const uploadVideoOnly = multer({ storage, fileFilter: videoOnlyFilter, limits: { fileSize: 100 * 1024 * 1024 } });

// Accept image for profilePic and video for dedicationSampleVideos in the same request
const mixedFileFilter = (_req, file, cb) => {
  if (file.fieldname === 'profilePic' || file.fieldname === 'image') {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    // return cb(new Error('Only image uploads are allowed for profilePic'));
  }
  const isSampleVideoIndexed = /^dedicationSampleVideo\[\d+\]$/.test(file.fieldname);
  if (isSampleVideoIndexed) {
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    return cb(new Error('Only video uploads are allowed for dedicationSampleVideo[index]'));
  }
  return cb(new Error('Unexpected field'));
};

export const uploadMixed = multer({ storage, fileFilter: mixedFileFilter, limits: { fileSize: 100 * 1024 * 1024 } });




