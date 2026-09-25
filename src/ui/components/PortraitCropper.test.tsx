import { centred, pan, zoomTo } from './PortraitCropper.js';

const LANDSCAPE = { width: 400, height: 200 };

describe('portrait crop math', () => {
  it('starts as the largest centred square', () => {
    expect(centred(LANDSCAPE)).toEqual({ x: 100, y: 0, side: 200 });
    expect(centred({ width: 200, height: 400 })).toEqual({ x: 0, y: 100, side: 200 });
  });

  it('pans, but never past an edge of the image', () => {
    const start = centred(LANDSCAPE);
    expect(pan(start, 50, 0, LANDSCAPE)).toEqual({ x: 150, y: 0, side: 200 });
    expect(pan(start, 500, 0, LANDSCAPE)).toEqual({ x: 200, y: 0, side: 200 });
    expect(pan(start, -500, 30, LANDSCAPE)).toEqual({ x: 0, y: 0, side: 200 });
  });

  it('zooms about the centre of the square', () => {
    expect(zoomTo(centred(LANDSCAPE), 2, LANDSCAPE)).toEqual({ x: 150, y: 50, side: 100 });
  });

  it('zooming back out pulls a square near an edge back inside the image', () => {
    const corner = { x: 300, y: 100, side: 100 };
    expect(zoomTo(corner, 1, LANDSCAPE)).toEqual({ x: 200, y: 0, side: 200 });
  });
});
