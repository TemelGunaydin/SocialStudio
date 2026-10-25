// LinkedIn/TikTok are manual handoffs only. These records never enter the X publishing queue.
export function linkedInText(value, limit = 3000, label = 'LinkedIn') {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${label} metni boş olamaz.`), { status: 400 });
  }
  const text = value.trim();
  // Conservative UTF-16 count, matching the browser counter (including links).
  if (text.length > limit) {
    throw Object.assign(new Error(`${label} metni bağlantılar dahil ${limit} karakteri aşamaz.`), { status: 400 });
  }
  return text;
}

export function linkedInInput(input, limit = 3000, label = 'LinkedIn') {
  const text = linkedInText(input?.text, limit, label);
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw Object.assign(new Error('Taslağı yeniden açıp kaydedin.'), { status: 400 });
  }
  const videoName = input.videoName ?? '';
  if (typeof videoName !== 'string' || videoName.length > 255 || /[\x00-\x1f/\\]/.test(videoName)
      || (videoName && !/\.mp4$/i.test(videoName))) {
    throw Object.assign(new Error('Geçerli bir MP4 dosya adı seçin.'), { status: 400 });
  }
  // Only a filename reminder is stored; never open a local path supplied by a browser.
  return { text, videoName, revision: input.revision };
}
