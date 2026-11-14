import { describe, expect, it } from 'vitest';
import { mediaUrlIdentity } from '../src/lib/mediaIdentity';

describe('media object identity', () => {
  it('ignores rotating S3 signing credentials', () => {
    expect(mediaUrlIdentity('https://s3.test/image?X-Amz-Date=old&X-Amz-Signature=one')).toBe(
      mediaUrlIdentity('https://s3.test/image?X-Amz-Date=new&X-Amz-Signature=two'),
    );
    expect(mediaUrlIdentity('https://s3.test/image?AWSAccessKeyId=one&Signature=old&Expires=1')).toBe(
      mediaUrlIdentity('https://s3.test/image?AWSAccessKeyId=two&Signature=new&Expires=2'),
    );
  });
  it('preserves the object, host and content version', () => {
    const first = mediaUrlIdentity('https://s3.test/image?versionId=1&X-Amz-Signature=one');
    for (const next of [
      'https://s3.test/other?versionId=1',
      'https://other.test/image?versionId=1',
      'https://s3.test/image?versionId=2',
    ])
      expect(mediaUrlIdentity(next)).not.toBe(first);
  });
  it('keeps local and blob sources distinct', () => {
    expect(mediaUrlIdentity('/image?v=1')).not.toBe(mediaUrlIdentity('/image?v=2'));
    expect(mediaUrlIdentity('blob:http://localhost/one')).not.toBe(
      mediaUrlIdentity('blob:http://localhost/two'),
    );
    expect(mediaUrlIdentity(undefined)).toBe('');
  });
});
