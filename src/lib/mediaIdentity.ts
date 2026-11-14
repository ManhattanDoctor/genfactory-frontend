// Signing credentials can rotate without changing the stored media object.
export function mediaUrlIdentity(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value, 'http://localhost');
    for (const key of [...url.searchParams.keys()]) {
      if (/^x-amz-/i.test(key) || /^(AWSAccessKeyId|Signature|Expires)$/.test(key))
        url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return value;
  }
}
