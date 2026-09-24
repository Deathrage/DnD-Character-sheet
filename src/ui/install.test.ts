import { detectBrowser, installSteps } from './install.js';

/** Real user-agent strings, one per engine the gate treats differently. */
const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  chromeIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15',
};

describe('detectBrowser', () => {
  it.each([
    ['chromeWindows', 0, 'chromium'],
    ['edgeWindows', 0, 'chromium'],
    ['chromeAndroid', 5, 'chromium'],
    ['samsungInternet', 5, 'chromium'],
    ['firefoxWindows', 0, 'firefox'],
    ['firefoxAndroid', 5, 'firefoxAndroid'],
    ['safariMac', 0, 'safari'],
    // iPadOS asks for the desktop site and sends the Mac string; touch points give it away.
    ['safariMac', 5, 'ios'],
    ['safariIphone', 5, 'ios'],
    // Every iOS browser is WebKit underneath, so Chrome and Firefox there install like Safari.
    ['chromeIphone', 5, 'ios'],
    ['firefoxIphone', 5, 'ios'],
  ] as const)('%s with %i touch points is %s', (key, touchPoints, expected) => {
    expect(detectBrowser(UA[key], touchPoints)).toBe(expected);
  });

  it('is other for an engine it does not know', () => {
    expect(detectBrowser('curl/8.0', 0)).toBe('other');
  });
});

describe('installSteps', () => {
  it('has steps for every browser that can install the app', () => {
    for (const browser of ['chromium', 'firefoxAndroid', 'safari', 'ios'] as const) {
      expect(installSteps(browser)).toEqual(expect.any(String));
    }
  });

  it('has none where the app cannot be installed', () => {
    expect(installSteps('firefox')).toBeNull();
    expect(installSteps('other')).toBeNull();
  });
});
