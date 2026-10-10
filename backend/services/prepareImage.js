function prepareImage(image, mimeType = 'image/jpeg') {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  if (typeof image !== 'string' || !image) {
    throw new Error(
      'An image in Base64 format is required.'
    );
  }

  if (!allowedTypes.includes(mimeType)) {
    throw new Error('Unsupported image type.');
  }

  const imageData = image.replace(
    /^data:image\/(?:jpeg|png|webp);base64,/,
    ''
  );

  // Reject oversized input before scanning or decoding it.
  const maxImageBytes = 5 * 1024 * 1024;
  if (imageData.length > 4 * Math.ceil(maxImageBytes / 3)) {
    throw new Error('Image exceeds the 5 MB limit.');
  }

  // Avoid repeated regex groups: camera-sized payloads can exhaust V8's stack.
  const padding = imageData.endsWith('==') ? 2 : imageData.endsWith('=') ? 1 : 0;
  const content = imageData.slice(0, imageData.length - padding);
  if (
    imageData.length === 0 ||
    imageData.length % 4 !== 0 ||
    /[^A-Za-z0-9+/]/.test(content)
  ) {
    throw new Error('Invalid Base64 image data.');
  }

  const imageBuffer = Buffer.from(
    imageData,
    'base64'
  );

  if (imageBuffer.length > maxImageBytes) {
    throw new Error(
      'Image exceeds the 5 MB limit.'
    );
  }

  return {
    inlineData: {
      mimeType,
      data: imageData,
    },
  };
}

module.exports = { prepareImage };
