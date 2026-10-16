import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useLookup } from '../useLookup';

type Call = { key: string; signal: AbortSignal; resolve: (v: string) => void; reject: (e: unknown) => void };

let calls: Call[];

function load(key: string) {
  return (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => calls.push({ key, signal, resolve, reject }));
}

function Probe({ k, delay }: { k: string | null; delay?: number }) {
  const r = useLookup(k, load(k ?? ''), delay);
  return (
    <Text testID="r">
      {JSON.stringify({ loading: r.loading, data: r.data ?? null, error: r.error ? String(r.error) : null, previous: r.previous ?? null })}
    </Text>
  );
}

function state() {
  const { previous: _previous, ...rest } = JSON.parse(String(screen.getByTestId('r').props.children));
  return rest;
}
const previous = () => JSON.parse(String(screen.getByTestId('r').props.children)).previous;

beforeEach(() => {
  calls = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it('does nothing for a null key', async () => {
  await render(<Probe k={null} />);
  await act(async () => jest.runAllTimers());
  expect(calls).toHaveLength(0);
  expect(state()).toEqual({ loading: false, data: null, error: null });
});

it('loads after the delay and returns the data for that key', async () => {
  await render(<Probe k="a" delay={350} />);
  expect(state().loading).toBe(true);
  await act(async () => jest.advanceTimersByTime(349));
  expect(calls).toHaveLength(0);
  await act(async () => jest.advanceTimersByTime(1));
  expect(calls.map((c) => c.key)).toEqual(['a']);
  await act(async () => calls[0].resolve('A'));
  expect(state()).toEqual({ loading: false, data: 'A', error: null });
});

it('a new key cancels the old request and never shows its stale answer', async () => {
  const view = await render(<Probe k="a" />);
  await act(async () => jest.runAllTimers());
  await view.rerender(<Probe k="b" />);
  expect(calls[0].signal.aborted).toBe(true);
  expect(state()).toEqual({ loading: true, data: null, error: null });
  await act(async () => jest.runAllTimers());
  await act(async () => calls[0].resolve('stale A'));
  expect(state().data).toBeNull();
  await act(async () => calls[1].resolve('B'));
  expect(state()).toEqual({ loading: false, data: 'B', error: null });
});

it('a key typed and changed within the delay never sends a request', async () => {
  const view = await render(<Probe k="a" delay={350} />);
  await act(async () => jest.advanceTimersByTime(200));
  await view.rerender(<Probe k="ab" delay={350} />);
  await act(async () => jest.advanceTimersByTime(350));
  expect(calls.map((c) => c.key)).toEqual(['ab']);
});

it('reports a failure for the current key', async () => {
  await render(<Probe k="a" />);
  await act(async () => jest.runAllTimers());
  await act(async () => calls[0].reject(new Error('offline')));
  expect(state()).toEqual({ loading: false, data: null, error: 'Error: offline' });
});

it('coming back to an earlier key loads it again instead of showing the old answer as current', async () => {
  const view = await render(<Probe k="a" />);
  await act(async () => jest.runAllTimers());
  await act(async () => calls[0].resolve('old A'));
  await view.rerender(<Probe k={null} />);
  await view.rerender(<Probe k="a" />);
  expect(state()).toEqual({ loading: true, data: null, error: null });
  await act(async () => jest.runAllTimers());
  await act(async () => calls[1].resolve('new A'));
  expect(state()).toEqual({ loading: false, data: 'new A', error: null });
});

it('keeps the last answer available as `previous` while the next one loads or fails', async () => {
  const view = await render(<Probe k="a" />);
  await act(async () => jest.runAllTimers());
  await act(async () => calls[0].resolve('A'));
  await view.rerender(<Probe k="b" />);
  expect(state().loading).toBe(true);
  expect(previous()).toBe('A');
  await act(async () => jest.runAllTimers());
  await act(async () => calls[1].reject(new Error('offline')));
  expect(state()).toEqual({ loading: false, data: null, error: 'Error: offline' });
  expect(previous()).toBe('A');
});

it('uses the latest load function when the timer fires', async () => {
  const seen: string[] = [];
  function Latest({ tag }: { tag: string }) {
    useLookup('same', async () => {
      seen.push(tag);
      return tag;
    }, 100);
    return null;
  }
  const view = await render(<Latest tag="first" />);
  await view.rerender(<Latest tag="second" />);
  await act(async () => jest.runAllTimers());
  expect(seen).toEqual(['second']);
});

it('unmounting mid-flight cancels the request', async () => {
  const view = await render(<Probe k="a" />);
  await act(async () => jest.runAllTimers());
  await view.unmount();
  expect(calls[0].signal.aborted).toBe(true);
});
