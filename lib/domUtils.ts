export async function downloadVideo(
  url: string,
  filename?: string,
  showToast?: (message: string, type?: string) => void
): Promise<void> {
  try {
    showToast?.('Starting download...', 'success');
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    showToast?.('Download failed, opening in new tab', 'error');
    window.open(url, '_blank');
  }
}

export function copyToClipboard(
  text: string,
  showToast?: (message: string, type?: string) => void
): void {
  navigator.clipboard.writeText(text);
  showToast?.('Copied!', 'success');
}
