export const SQUARE_CROP_FILTER = 'crop=min(iw\\,ih):min(iw\\,ih)'
export const BEST_JPG_OUTPUT = ['-c:v', 'mjpeg', '-qmin', '1', '-q:v', '1']
export const BEST_JPG_CONVERSION_ARGUMENT = `ThumbnailsConvertor+FFmpeg_o:${BEST_JPG_OUTPUT.join(' ')}`
export const SQUARE_JPG_CONVERSION_ARGUMENT = `${BEST_JPG_CONVERSION_ARGUMENT} -vf "${SQUARE_CROP_FILTER}"`
