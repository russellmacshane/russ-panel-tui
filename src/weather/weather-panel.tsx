import {Box, Text} from 'ink';
import {formatLocation} from '../location/format.js';
import type {Location} from '../location/types.js';
import {describeWeatherCode} from './codes.js';
import type {WeatherReading} from './client.js';
import type {WeatherState} from './use-weather.js';

export function WeatherPanel({
	location,
	state,
}: {
	location: Location;
	state: WeatherState;
}) {
	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1}>
			<Text bold>WEATHER</Text>
			<Text dimColor>{formatLocation(location)}</Text>
			<Box marginTop={1} flexDirection="column">
				{renderBody(state)}
			</Box>
		</Box>
	);
}

function renderBody(state: WeatherState) {
	switch (state.status) {
		case 'loading': {
			return <Text dimColor>Loading current conditions…</Text>;
		}

		case 'ready': {
			return <Reading reading={state.reading} />;
		}

		case 'stale': {
			return (
				<>
					<Reading reading={state.reading} />
					<Box marginTop={1} flexDirection="column">
						<Text color="yellow">! Stale — refresh failed</Text>
						<Text color="yellow" dimColor>
							{state.message}
						</Text>
					</Box>
				</>
			);
		}

		case 'error': {
			return (
				<>
					<Text color="red">! Could not load weather</Text>
					<Text color="red" dimColor>
						{state.message}
					</Text>
					<Box marginTop={1}>
						<Text dimColor>Press r to retry.</Text>
					</Box>
				</>
			);
		}
	}
}

function Reading({reading}: {reading: WeatherReading}) {
	return (
		<>
			<Text>
				<Text bold color="cyan">
					{reading.temperature}
					{reading.temperatureUnit}
				</Text>
				{'  '}
				{describeWeatherCode(reading.weatherCode)}
			</Text>
			<Text dimColor>
				Updated {reading.retrievedAt.toLocaleTimeString()}
			</Text>
		</>
	);
}
