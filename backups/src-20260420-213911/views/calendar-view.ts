/**
 * Calendar View
 * 日历视图 - 显示在右侧边栏，与 AI 分析面板并列
 */

import { ItemView, setIcon, WorkspaceLeaf } from 'obsidian';
import type LifeWikiPlugin from '../main';

export const VIEW_TYPE_CALENDAR = 'lifewiki-calendar';

interface MonthInfo {
	year: number;
	month: number;
}

type DateClickCallback = (date: Date) => void;

/**
 * CalendarView - 日历视图组件
 * 显示月历，点击日期可以打开对应日记
 */
export class CalendarView extends ItemView {
	private plugin: LifeWikiPlugin;
	private currentMonth: MonthInfo;
	private onDateClickCallback: DateClickCallback | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: LifeWikiPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentMonth = {
			year: new Date().getFullYear(),
			month: new Date().getMonth()
		};
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return '日历';
	}

	getIcon(): string {
		return 'calendar';
	}

	async onOpen(): Promise<void> {
		this.renderCalendar();
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	/**
	 * 设置日期点击回调
	 */
	setOnDateClick(callback: DateClickCallback): void {
		this.onDateClickCallback = callback;
	}

	/**
	 * 处理日期点击
	 */
	async handleDateClick(date: Date): Promise<void> {
		if (this.onDateClickCallback) {
			this.onDateClickCallback(date);
		}
	}

	/**
	 * 获取指定月份的日历天数数组
	 * 返回 42 个日期（6 周 x 7 天）
	 */
	getMonthDays(year: number, month: number): Date[] {
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const days: Date[] = [];

		// 获取星期几（0 = 周日）
		const startDayOfWeek = firstDay.getDay();

		// 添加上个月的日期来填充第一周
		for (let i = startDayOfWeek - 1; i >= 0; i--) {
			const prevDate = new Date(year, month, -i);
			days.push(prevDate);
		}

		// 添加当月的日期
		for (let d = 1; d <= lastDay.getDate(); d++) {
			days.push(new Date(year, month, d));
		}

		// 添加下个月的日期来补满 6 周
		const remainingDays = 42 - days.length;
		for (let i = 1; i <= remainingDays; i++) {
			days.push(new Date(year, month + 1, i));
		}

		return days;
	}

	/**
	 * 判断是否是今天
	 */
	isToday(date: Date): boolean {
		const today = new Date();
		return date.getFullYear() === today.getFullYear() &&
			date.getMonth() === today.getMonth() &&
			date.getDate() === today.getDate();
	}

	/**
	 * 判断是否是当前选中的月份
	 */
	isCurrentMonth(date: Date): boolean {
		return date.getFullYear() === this.currentMonth.year &&
			date.getMonth() === this.currentMonth.month;
	}

	/**
	 * 获取下个月的信息
	 */
	getNextMonth(year: number, month: number): MonthInfo {
		if (month === 11) {
			return { year: year + 1, month: 0 };
		}
		return { year, month: month + 1 };
	}

	/**
	 * 获取上个月的日期
	 */
	getPrevMonth(year: number, month: number): MonthInfo {
		if (month === 0) {
			return { year: year - 1, month: 11 };
		}
		return { year, month: month - 1 };
	}

	/**
	 * 检查指定日期的日记是否存在
	 */
	async diaryExistsForDate(dateStr: string): Promise<boolean> {
		try {
			const filePath = `Daily/${dateStr}.md`;
			const file = this.app.vault.getAbstractFileByPath(filePath);
			return file !== null && file !== undefined;
		} catch {
			return false;
		}
	}

	/**
	 * 导航到下个月
	 */
	async goToNextMonth(): Promise<void> {
		this.currentMonth = this.getNextMonth(
			this.currentMonth.year,
			this.currentMonth.month
		);
		this.renderCalendar();
	}

	/**
	 * 导航到上个月
	 */
	async goToPrevMonth(): Promise<void> {
		this.currentMonth = this.getPrevMonth(
			this.currentMonth.year,
			this.currentMonth.month
		);
		this.renderCalendar();
	}

	/**
	 * 导航到今天
	 */
	async goToToday(): Promise<void> {
		const today = new Date();
		this.currentMonth = {
			year: today.getFullYear(),
			month: today.getMonth()
		};
		this.renderCalendar();
	}

	/**
	 * 渲染日历
	 */
	private async renderCalendar(): Promise<void> {
		const container = this.containerEl;
		container.empty();

		// 添加样式
		this.addStyles();

		// 创建日历容器
		const calendarEl = container.createEl('div', {
			cls: 'lifewiki-calendar'
		});

		// 渲染头部（月份导航）
		this.renderHeader(calendarEl);

		// 渲染星期标题行
		this.renderWeekdayHeader(calendarEl);

		// 渲染日期网格
		await this.renderDays(calendarEl);
	}

	/**
	 * 渲染月份导航头部
	 */
	private renderHeader(container: HTMLElement): void {
		const header = container.createEl('div', {
			cls: 'lifewiki-calendar-header'
		});

		// 上月按钮
		const prevBtn = header.createEl('button', {
			cls: 'lifewiki-calendar-nav-btn',
			text: '‹'
		});
		prevBtn.addEventListener('click', () => this.goToPrevMonth());

		// 月份标题
		const monthTitle = header.createEl('span', {
			cls: 'lifewiki-calendar-title',
			text: this.getMonthTitle()
		});
		monthTitle.addEventListener('click', () => this.goToToday());

		// 下月按钮
		const nextBtn = header.createEl('button', {
			cls: 'lifewiki-calendar-nav-btn',
			text: '›'
		});
		nextBtn.addEventListener('click', () => this.goToNextMonth());
	}

	/**
	 * 渲染星期标题行
	 */
	private renderWeekdayHeader(container: HTMLElement): void {
		const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
		const header = container.createEl('div', {
			cls: 'lifewiki-calendar-weekdays'
		});

		for (const day of weekdays) {
			header.createEl('div', {
				cls: 'lifewiki-calendar-weekday',
				text: day
			});
		}
	}

	/**
	 * 渲染日期网格
	 */
	private async renderDays(container: HTMLElement): Promise<void> {
		const days = this.getMonthDays(
			this.currentMonth.year,
			this.currentMonth.month
		);

		const grid = container.createEl('div', {
			cls: 'lifewiki-calendar-grid'
		});

		for (const date of days) {
			const dayEl = await this.createDayElement(date, grid);
			grid.appendChild(dayEl);
		}
	}

	/**
	 * 创建单个日期元素
	 */
	private async createDayElement(date: Date, container: HTMLElement): Promise<HTMLElement> {
		const dayEl = container.createEl('div', {
			cls: 'lifewiki-calendar-day'
		});

		const isCurrentMonth = this.isCurrentMonth(date);
		const isToday = this.isToday(date);

		if (!isCurrentMonth) {
			dayEl.addClass('lifewiki-calendar-day-other-month');
		}

		if (isToday) {
			dayEl.addClass('lifewiki-calendar-day-today');
		}

		// 检查日记是否存在
		const dateStr = this.formatDate(date);
		const hasDiary = await this.diaryExistsForDate(dateStr);
		if (hasDiary) {
			dayEl.addClass('lifewiki-calendar-day-has-diary');
		}

		// 日期数字
		const dayNum = dayEl.createEl('span', {
			cls: 'lifewiki-calendar-day-num',
			text: String(date.getDate())
		});

		// 点击事件
		dayEl.addEventListener('click', () => {
			this.handleDateClick(date);
		});

		return dayEl;
	}

	/**
	 * 获取月份标题
	 */
	private getMonthTitle(): string {
		const monthNames = [
			'一月', '二月', '三月', '四月', '五月', '六月',
			'七月', '八月', '九月', '十月', '十一月', '十二月'
		];
		return `${this.currentMonth.year}年 ${monthNames[this.currentMonth.month]}`;
	}

	/**
	 * 格式化日期为 YYYY-MM-DD
	 */
	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * 添加日历样式
	 */
	private addStyles(): void {
		const styleId = 'lifewiki-calendar-styles';
		if (document.getElementById(styleId)) return;

		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			.lifewiki-calendar {
				padding: 12px;
				height: 100%;
				display: flex;
				flex-direction: column;
				background: var(--background-primary);
			}

			.lifewiki-calendar-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				padding: 8px 0;
				margin-bottom: 8px;
			}

			.lifewiki-calendar-title {
				font-size: 16px;
				font-weight: 600;
				cursor: pointer;
			}

			.lifewiki-calendar-nav-btn {
				background: none;
				border: none;
				font-size: 20px;
				cursor: pointer;
				padding: 4px 12px;
				color: var(--text-muted);
				border-radius: 4px;
			}

			.lifewiki-calendar-nav-btn:hover {
				background: var(--background-secondary);
				color: var(--text-normal);
			}

			.lifewiki-calendar-weekdays {
				display: grid;
				grid-template-columns: repeat(7, 1fr);
				text-align: center;
				margin-bottom: 4px;
			}

			.lifewiki-calendar-weekday {
				font-size: 12px;
				color: var(--text-muted);
				padding: 4px;
			}

			.lifewiki-calendar-grid {
				display: grid;
				grid-template-columns: repeat(7, 1fr);
				gap: 0.5px;
				max-height: 33vh;
				overflow: hidden;
			}

			.lifewiki-calendar-day {
				display: flex;
				align-items: center;
				justify-content: center;
				cursor: pointer;
				border-radius: 4px;
				min-height: 24px;
				padding: 2px;
				position: relative;
			}

			.lifewiki-calendar-day:hover {
				background: var(--background-secondary);
			}

			.lifewiki-calendar-day-num {
				font-size: 11px;
			}

			.lifewiki-calendar-day-today .lifewiki-calendar-day-num {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				width: 28px;
				height: 28px;
				border-radius: 50%;
				display: flex;
				align-items: center;
				justify-content: center;
				font-weight: 600;
			}

			.lifewiki-calendar-day-has-diary::after {
				content: '';
				position: absolute;
				bottom: 4px;
				width: 4px;
				height: 4px;
				border-radius: 50%;
				background: var(--interactive-accent);
			}

			.lifewiki-calendar-day-other-month {
				opacity: 0.3;
			}
		`;
		document.head.appendChild(style);
	}
}

/**
 * 创建日历视图
 */
export function createCalendarView(leaf: WorkspaceLeaf, plugin: LifeWikiPlugin): CalendarView {
	return new CalendarView(leaf, plugin);
}
