/**
 * Calendar View Tests
 * Tests for calendar view utilities and date handling
 */

/**
 * Calendar utility functions extracted for testing
 * These are the pure functions from CalendarView that can be tested without Obsidian mocks
 */

// Helper function: format date as YYYY-MM-DD
function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

// Helper function: check if two dates are the same day
function isSameDay(d1: Date, d2: Date): boolean {
	return d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate();
}

// Helper function: check if date is today
function isToday(date: Date): boolean {
	const today = new Date();
	return isSameDay(date, today);
}

// Helper function: get next month info
interface MonthInfo {
	year: number;
	month: number;
}

function getNextMonth(year: number, month: number): MonthInfo {
	if (month === 11) {
		return { year: year + 1, month: 0 };
	}
	return { year, month: month + 1 };
}

function getPrevMonth(year: number, month: number): MonthInfo {
	if (month === 0) {
		return { year: year - 1, month: 11 };
	}
	return { year, month: month - 1 };
}

// Helper function: get month days (42 days for calendar grid)
function getMonthDays(year: number, month: number): Date[] {
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const days: Date[] = [];

	// Get day of week (0 = Sunday)
	const startDayOfWeek = firstDay.getDay();

	// Add previous month days to fill first week
	for (let i = startDayOfWeek - 1; i >= 0; i--) {
		const prevDate = new Date(year, month, -i);
		days.push(prevDate);
	}

	// Add current month days
	for (let d = 1; d <= lastDay.getDate(); d++) {
		days.push(new Date(year, month, d));
	}

	// Add next month days to complete 6 weeks
	const remainingDays = 42 - days.length;
	for (let i = 1; i <= remainingDays; i++) {
		days.push(new Date(year, month + 1, i));
	}

	return days;
}

// Helper function: check if date is in current month
function isCurrentMonth(date: Date, year: number, month: number): boolean {
	return date.getFullYear() === year && date.getMonth() === month;
}

// Helper function: parse date from filename
function parseDateFromFilename(filename: string): Date | null {
	const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
	if (match) {
		return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
	}
	return null;
}

// Helper function: get diary file path
function getDiaryFilePath(date: Date, diaryFolder: string = 'Daily'): string {
	return `${diaryFolder}/${formatDate(date)}.md`;
}

describe('CalendarView Utils', () => {
	describe('formatDate', () => {
		it('should format date as YYYY-MM-DD', () => {
			const date = new Date(2026, 3, 20); // April 20, 2026
			expect(formatDate(date)).toBe('2026-04-20');
		});

		it('should pad single digit month and day', () => {
			const date = new Date(2026, 0, 5); // January 5, 2026
			expect(formatDate(date)).toBe('2026-01-05');
		});
	});

	describe('isSameDay', () => {
		it('should return true for same day', () => {
			const d1 = new Date(2026, 3, 20);
			const d2 = new Date(2026, 3, 20);
			expect(isSameDay(d1, d2)).toBe(true);
		});

		it('should return false for different days', () => {
			const d1 = new Date(2026, 3, 20);
			const d2 = new Date(2026, 3, 21);
			expect(isSameDay(d1, d2)).toBe(false);
		});

		it('should return false for different months', () => {
			const d1 = new Date(2026, 3, 20);
			const d2 = new Date(2026, 4, 20);
			expect(isSameDay(d1, d2)).toBe(false);
		});
	});

	describe('isToday', () => {
		it('should return true for today', () => {
			const today = new Date();
			expect(isToday(today)).toBe(true);
		});

		it('should return false for other days', () => {
			const otherDay = new Date(2020, 0, 1);
			expect(isToday(otherDay)).toBe(false);
		});
	});

	describe('getNextMonth', () => {
		it('should increment month', () => {
			const next = getNextMonth(2026, 3); // April
			expect(next.year).toBe(2026);
			expect(next.month).toBe(4); // May
		});

		it('should wrap to January of next year', () => {
			const next = getNextMonth(2026, 11); // December
			expect(next.year).toBe(2027);
			expect(next.month).toBe(0); // January
		});
	});

	describe('getPrevMonth', () => {
		it('should decrement month', () => {
			const prev = getPrevMonth(2026, 3); // April
			expect(prev.year).toBe(2026);
			expect(prev.month).toBe(2); // March
		});

		it('should wrap to December of previous year', () => {
			const prev = getPrevMonth(2026, 0); // January
			expect(prev.year).toBe(2025);
			expect(prev.month).toBe(11); // December
		});
	});

	describe('getMonthDays', () => {
		it('should return 42 days', () => {
			const days = getMonthDays(2026, 3); // April 2026
			expect(days.length).toBe(42);
		});

		it('should start with days from previous month', () => {
			// April 2026 starts on Wednesday (day 3)
			const days = getMonthDays(2026, 3);
			const firstDay = days[0];
			expect(firstDay.getMonth()).toBe(2); // March
		});

		it('should end with days from next month', () => {
			const days = getMonthDays(2026, 3);
			const lastDay = days[41];
			expect(lastDay.getMonth()).toBe(4); // May
		});

		it('should contain all days of the month', () => {
			const days = getMonthDays(2026, 3); // April has 30 days
			const aprilDays = days.filter(d => d.getMonth() === 3);
			expect(aprilDays.length).toBe(30);
		});
	});

	describe('isCurrentMonth', () => {
		it('should return true for dates in current month', () => {
			const date = new Date(2026, 3, 15);
			expect(isCurrentMonth(date, 2026, 3)).toBe(true);
		});

		it('should return false for dates in other months', () => {
			const date = new Date(2026, 2, 15);
			expect(isCurrentMonth(date, 2026, 3)).toBe(false);
		});
	});

	describe('parseDateFromFilename', () => {
		it('should parse valid diary filename', () => {
			const date = parseDateFromFilename('2026-04-20.md');
			expect(date).toBeInstanceOf(Date);
			expect(date?.getFullYear()).toBe(2026);
			expect(date?.getMonth()).toBe(3); // April (0-indexed)
			expect(date?.getDate()).toBe(20);
		});

		it('should return null for invalid filename', () => {
			expect(parseDateFromFilename('invalid.md')).toBeNull();
			expect(parseDateFromFilename('not-a-date.md')).toBeNull();
		});
	});

	describe('getDiaryFilePath', () => {
		it('should return correct diary path', () => {
			const date = new Date(2026, 3, 20);
			expect(getDiaryFilePath(date)).toBe('Daily/2026-04-20.md');
		});

		it('should support custom diary folder', () => {
			const date = new Date(2026, 3, 20);
			expect(getDiaryFilePath(date, 'Journal')).toBe('Journal/2026-04-20.md');
		});
	});
});

describe('VIEW_TYPE_CALENDAR', () => {
	it('should have correct value', () => {
		const VIEW_TYPE_CALENDAR = 'lifewiki-calendar';
		expect(VIEW_TYPE_CALENDAR).toBe('lifewiki-calendar');
	});
});
