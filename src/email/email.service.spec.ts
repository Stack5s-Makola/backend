import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

interface BrevoBody {
  sender: { email: string; name: string };
  to: { email: string }[];
  subject: string;
  textContent: string;
  htmlContent?: string;
}

describe('EmailService', () => {
  let fetchMock: jest.Mock;
  let service: EmailService;

  const configWith = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConfigService;

  /** The JSON body of the nth fetch call. */
  const sentBody = (call = 0): BrevoBody => {
    const init = (fetchMock.mock.calls as { body: string }[][])[call][1];
    return JSON.parse(init.body) as BrevoBody;
  };

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock;

    service = new EmailService(
      configWith({
        BREVO_API_KEY: 'test-key',
        MAIL_FROM: 'no-reply@makola.app',
      }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('authenticates with the Brevo API key', async () => {
    await service.sendMail('buyer@example.com', 'Hi', 'Hello');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers).toMatchObject({ 'api-key': 'test-key' });
  });

  it('sends from the configured address', async () => {
    await service.sendMail('buyer@example.com', 'Hi', 'Hello');

    expect(sentBody().sender.email).toBe('no-reply@makola.app');
    expect(sentBody().to).toEqual([{ email: 'buyer@example.com' }]);
  });

  it('puts the code in both the text and the html of an OTP email', async () => {
    await service.sendOtpEmail('buyer@example.com', '483920', 10);

    expect(sentBody().textContent).toContain('483920');
    expect(sentBody().htmlContent).toContain('483920');
    expect(sentBody().subject).toContain('verification code');
  });

  it('swallows a failed OTP send so registration still succeeds', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorised'),
    });

    await expect(
      service.sendOtpEmail('buyer@example.com', '483920', 10),
    ).resolves.toBeUndefined();
  });

  it('reports a failure on an ordinary send', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('sender not verified'),
    });

    await expect(
      service.sendMail('buyer@example.com', 'Hi', 'Hello'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('reports a network failure rather than hanging', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    await expect(
      service.sendMail('buyer@example.com', 'Hi', 'Hello'),
    ).rejects.toThrow(/Could not reach the email provider/);
  });

  it('fails clearly when the API key is missing', async () => {
    service = new EmailService(configWith({}));

    await expect(
      service.sendMail('buyer@example.com', 'Hi', 'Hello'),
    ).rejects.toThrow(/BREVO_API_KEY is missing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
