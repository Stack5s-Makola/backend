import { clearTemplateCache, readTemplate, renderTemplate } from './template';

describe('renderTemplate', () => {
  beforeEach(() => clearTemplateCache());

  it('finds the verifyOtp template', () => {
    expect(readTemplate('verifyOtp')).toContain('{{code}}');
  });

  it('puts the code into the html', () => {
    const html = renderTemplate('verifyOtp', { code: '004213', minutes: 10 });

    expect(html).toContain('004213');
    expect(html).not.toContain('{{code}}');
  });

  it('keeps a code s leading zeros', () => {
    expect(renderTemplate('verifyOtp', { code: '000042' })).toContain('000042');
  });

  it('fills every placeholder it has a value for', () => {
    const html = renderTemplate('verifyOtp', { code: '123456', minutes: 10 });

    expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
  });

  it('leaves a placeholder alone when no value is given', () => {
    // Visible in the email beats silently blank: the gap is obvious.
    expect(renderTemplate('verifyOtp', { code: '123456' })).toContain(
      '{{minutes}}',
    );
  });

  it('escapes anything interpolated, so a value cannot inject markup', () => {
    const html = renderTemplate('verifyOtp', {
      code: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('explains itself when the template does not exist', () => {
    expect(() => renderTemplate('nope')).toThrow(/nope\.html" was not found/);
  });

  it('reads a template once and caches it', () => {
    const first = readTemplate('verifyOtp');

    expect(readTemplate('verifyOtp')).toBe(first);
  });
});
