import { toWriteResponse } from './write-response.dto';

describe('toWriteResponse', () => {
  it('returns data + empty missingFields + null nextRequired by default', () => {
    expect(toWriteResponse({ id: 'x' })).toEqual({
      data: { id: 'x' },
      missingFields: [],
      nextRequired: null,
    });
  });

  it('passes missingFields through and auto-derives nextRequired = first', () => {
    expect(toWriteResponse({ id: 'x' }, { missingFields: ['lines', 'portions'] })).toEqual({
      data: { id: 'x' },
      missingFields: ['lines', 'portions'],
      nextRequired: 'lines',
    });
  });

  it('honours an explicit nextRequired', () => {
    expect(
      toWriteResponse({ id: 'x' }, {
        missingFields: ['lines', 'portions'],
        nextRequired: 'portions',
      }),
    ).toEqual({
      data: { id: 'x' },
      missingFields: ['lines', 'portions'],
      nextRequired: 'portions',
    });
  });

  it('allows explicit null nextRequired even with non-empty missingFields', () => {
    expect(
      toWriteResponse({ id: 'x' }, {
        missingFields: ['lines'],
        nextRequired: null,
      }),
    ).toEqual({
      data: { id: 'x' },
      missingFields: ['lines'],
      nextRequired: null,
    });
  });
});
