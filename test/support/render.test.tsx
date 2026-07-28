import {useEffect, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {expect, test} from 'vitest';
import {keys} from './fake-terminal.js';
import {render} from './render.js';

function Hello() {
	return <Text>hello harness</Text>;
}

function ReportedSize() {
	const {stdout} = useStdout();
	const [size, setSize] = useState({
		columns: stdout.columns,
		rows: stdout.rows,
	});

	useEffect(() => {
		const onResize = () => {
			setSize({columns: stdout.columns, rows: stdout.rows});
		};

		stdout.on('resize', onResize);
		return () => {
			stdout.off('resize', onResize);
		};
	}, [stdout]);

	return (
		<Text>
			size {size.columns}x{size.rows}
		</Text>
	);
}

function KeyLog() {
	const [pressed, setPressed] = useState<string[]>([]);
	useInput(input => {
		setPressed(previous => [...previous, input]);
	});

	return <Text>pressed [{pressed.join(',')}]</Text>;
}

function Quitter() {
	const {exit} = useApp();
	useInput(input => {
		if (input === 'q') {
			exit();
		}
	});

	return <Text>press q</Text>;
}

/** Settles asynchronously, with no timer for a test to fake or wait out. */
function AsyncGreeting() {
	const [value, setValue] = useState('pending');
	useEffect(() => {
		void Promise.resolve('settled').then(setValue);
	}, []);

	return <Text>value {value}</Text>;
}

function Teardown({onUnmount}: {onUnmount: () => void}) {
	useEffect(() => onUnmount, [onUnmount]);
	return <Text>mounted</Text>;
}

test('renders a component and exposes the frame as text', async () => {
	const {lastFrame, waitUntilRenderFlush} = render(<Hello />);
	await waitUntilRenderFlush();

	expect(lastFrame()).toContain('hello harness');
});

test('components observe the configured terminal size', async () => {
	const {lastFrame, waitUntilRenderFlush} = render(<ReportedSize />, {
		columns: 120,
		rows: 40,
	});
	await waitUntilRenderFlush();

	expect(lastFrame()).toContain('size 120x40');
});

test('a resize is observed and re-rendered', async () => {
	const harness = render(<ReportedSize />, {columns: 100, rows: 30});
	await harness.waitUntilRenderFlush();
	expect(harness.lastFrame()).toContain('size 100x30');

	harness.resize({columns: 60, rows: 20});
	await harness.waitUntilRenderFlush();

	expect(harness.lastFrame()).toContain('size 60x20');
});

test('a key press reaches a component using useInput', async () => {
	const harness = render(<KeyLog />);
	await harness.waitUntilRenderFlush();

	harness.write('a');
	await harness.waitUntilRenderFlush();
	expect(harness.lastFrame()).toContain('pressed [a]');

	// Written separately and flushed between: unflushed writes arrive as a
	// single readable chunk and `useInput` sees them as one input, exactly as
	// a real terminal delivers a fast paste.
	harness.write('b');
	await harness.waitUntilRenderFlush();

	expect(harness.lastFrame()).toContain('pressed [a,b]');
});

test('an async update is awaited by flushing, not by a fixed delay', async () => {
	const harness = render(<AsyncGreeting />);

	// A single flush is enough: it awaits the promise settling and the
	// resulting re-render being written. No `await delay(50)` anywhere.
	await harness.waitUntilRenderFlush();

	expect(harness.frames[0]).toContain('value pending');
	expect(harness.lastFrame()).toContain('value settled');
});

test('exit() settles waitUntilExit', async () => {
	const harness = render(<Quitter />);
	await harness.waitUntilRenderFlush();

	harness.write('q');

	await expect(harness.waitUntilExit()).resolves.toBeUndefined();
});

test('unmount runs teardown effects and stops producing frames', async () => {
	let torn = false;
	const harness = render(
		<Teardown
			onUnmount={() => {
				torn = true;
			}}
		/>,
	);
	await harness.waitUntilRenderFlush();
	expect(harness.lastFrame()).toContain('mounted');

	harness.unmount();
	await harness.waitUntilExit();
	const frameCount = harness.frames.length;

	expect(torn).toBe(true);
	harness.rerender(<Text>should not appear</Text>);
	expect(harness.frames.length).toBe(frameCount);
});

test('frames accumulate across updates', async () => {
	const harness = render(<KeyLog />);
	await harness.waitUntilRenderFlush();
	const before = harness.frames.length;

	harness.write('z');
	await harness.waitUntilRenderFlush();

	expect(harness.frames.length).toBeGreaterThan(before);
});

test('layout components render at the configured width', async () => {
	const harness = render(
		<Box borderStyle="round" width={20}>
			<Text>boxed</Text>
		</Box>,
		{columns: 40, rows: 10},
	);
	await harness.waitUntilRenderFlush();

	const widest = Math.max(
		...harness.lastFrame().split('\n').map(line => line.length),
	);
	expect(widest).toBe(20);
});
