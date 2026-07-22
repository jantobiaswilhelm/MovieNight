import assert from 'node:assert/strict';
import { getSeasonalTheme } from './seasonalTheme.js';

// Halloween window (October = month index 9)
assert.equal(getSeasonalTheme(new Date(2026, 9, 24)).key, 'halloween');
assert.equal(getSeasonalTheme(new Date(2026, 9, 31)).key, 'halloween');
assert.equal(getSeasonalTheme(new Date(2026, 9, 23)), null);

// Christmas window (December = 11)
assert.equal(getSeasonalTheme(new Date(2026, 11, 20)).key, 'christmas');
assert.equal(getSeasonalTheme(new Date(2026, 11, 26)).key, 'christmas');

// New Year (Dec 31 / Jan 1)
assert.equal(getSeasonalTheme(new Date(2026, 11, 31)).key, 'newyear');
assert.equal(getSeasonalTheme(new Date(2026, 0, 1)).key, 'newyear');

// April Fools (April = 3)
assert.equal(getSeasonalTheme(new Date(2026, 3, 1)).key, 'aprilfools');
assert.equal(getSeasonalTheme(new Date(2026, 3, 2)), null);

// Ordinary day
assert.equal(getSeasonalTheme(new Date(2026, 6, 22)), null);

// Override wins regardless of date; unknown override yields null
assert.equal(getSeasonalTheme(new Date(2026, 6, 22), 'christmas').key, 'christmas');
assert.equal(getSeasonalTheme(new Date(2026, 6, 22), 'bogus'), null);

console.log('seasonalTheme: all assertions passed');
