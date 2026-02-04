class ScheduleMiniApp {
    constructor() {
        this.currentDate = new Date();
        this.currentYear = this.currentDate.getFullYear();
        this.currentMonth = this.currentDate.getMonth(); // 0-11
        this.selectedDay = null;
        this.masters = [];
        this.daysOff = []; 
        this.schedule = {};
        this.selectedMasters = new Set();
        this.chatId = null;
        
        // Новые свойства для View Mode
        this.mode = 'edit'; // 'edit' or 'view'
        this.filterMode = 'all'; // 'all' or 'my'
        this.targetMasterId = null; // ID "меня" для фильтрации
        this.isReadOnly = false;
        
        this.monthNames = [
            "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
            "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
        ];
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadDataFromURL();
            
            this.loadTheme();
            
            // В режиме просмотра загружаем график из полученных данных, а не из localStorage
            if (this.mode !== 'view') {
                this.loadFromLocalStorage();
            }
            
            this.initUI();
            this.renderCalendar();
            this.renderMastersList();
            this.hideLoading();
            
            document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
            
            // Инициализация фильтра
            this.setupViewFilter();
            
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.showNotification('Ошибка загрузки данных', 'error');
        }
    }
    
    setupViewFilter() {
        if (this.mode === 'view') {
            document.getElementById('view-toggle').style.display = 'flex';
            
            const options = document.querySelectorAll('.toggle-option');
            const bg = document.querySelector('.toggle-bg');
            
            options.forEach(option => {
                option.addEventListener('click', (e) => {
                    // Update UI
                    options.forEach(o => o.classList.remove('active'));
                    e.target.classList.add('active');
                    
                    // Move background
                    const index = Array.from(options).indexOf(e.target);
                    bg.style.transform = `translateX(${index * 100}%)`;
                    
                    // Apply filter
                    this.filterMode = e.target.dataset.filter;
                    this.applyFilter();
                });
            });
            
            // Если передан параметр filter=my в URL, активируем его
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('filter') === 'my' && this.targetMasterId) {
                // Trigger click on 'my' option
                const myOption = document.querySelector('.toggle-option[data-filter="my"]');
                if (myOption) myOption.click();
            }
        }
    }
    
    applyFilter() {
        this.renderCalendar();
        // В режиме фильтрации сбрасываем выбор дня, чтобы не путать
        this.selectedDay = null;
        this.selectedMasters.clear();
        this.updateDayInfo();
        this.renderMastersList();
        this.updateStats();
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);
    }
    
    updateThemeIcon(theme) {
        const icon = document.querySelector('#theme-toggle i');
        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
            icon.title = 'Переключить на светлую тему';
        } else {
            icon.className = 'fas fa-moon';
            icon.title = 'Переключить на темную тему';
        }
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }
    
    async loadDataFromURL() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const dataParam = urlParams.get('data');
            
            this.chatId = urlParams.get('chat');
            
            // Проверка режима
            const modeParam = urlParams.get('mode');
            if (modeParam === 'view') {
                this.mode = 'view';
                this.isReadOnly = true;
                document.body.classList.add('read-only');
                // Скрываем контролы редактирования
                document.getElementById('calendar-controls').style.display = 'none';
                document.getElementById('masters-hint').textContent = 'Просмотр графика';
                document.getElementById('prev-month').style.display = 'none';
                document.getElementById('next-month').style.display = 'none';
                document.getElementById('stat-selected-container').style.display = 'none';
            }
            
            if (!dataParam) {
                throw new Error('No data parameter found');
            }
            
            const decodedParam = decodeURIComponent(dataParam);
            const jsonStr = atob(decodedParam);
            const parsedData = JSON.parse(jsonStr);
            
            // Парсинг данных
            if (parsedData.m) {
                this.masters = parsedData.m.map(master => ({
                    id: master[0],
                    name: master[1]
                }));
                
                if (parsedData.d) {
                    this.daysOff = parsedData.d.map(item => ({
                        masterId: item[0],
                        date: item[1]
                    }));
                }
                
                // Если передали расписание (режим просмотра)
                if (parsedData.s) {
                    this.schedule = parsedData.s;
                }
                
                // Если передали год/месяц, устанавливаем их
                if (parsedData.year && parsedData.month) {
                    this.currentYear = parsedData.year;
                    this.currentMonth = parsedData.month - 1; // JS months are 0-indexed
                }
                
                // Если передали ID текущего мастера (для подсветки)
                if (parsedData.target_master_id) {
                    this.targetMasterId = parsedData.target_master_id;
                }
            } else if (Array.isArray(parsedData)) {
                // Старый формат (только мастера)
                this.masters = parsedData.map(master => ({
                    id: master[0],
                    name: master[1]
                }));
            }
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            throw new Error('Не удалось загрузить данные мастеров');
        }
    }
    
    loadFromLocalStorage() {
        try {
            const key = `schedule_${this.currentYear}_${this.currentMonth + 1}`;
            const savedData = localStorage.getItem(key);
            
            if (savedData) {
                this.schedule = JSON.parse(savedData);
            }
        } catch (error) {
            console.error('Ошибка загрузки из localStorage:', error);
        }
    }
    
    saveToLocalStorage() {
        if (this.isReadOnly) return; // Не сохраняем в режиме просмотра
        try {
            const key = `schedule_${this.currentYear}_${this.currentMonth + 1}`;
            localStorage.setItem(key, JSON.stringify(this.schedule));
            this.showSaveNotification();
        } catch (error) {
            console.error('Ошибка сохранения в localStorage:', error);
        }
    }
    
    initUI() {
        this.updateMonthTitle();
        this.updateStats();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Навигация (отключена в view mode визуально, но логика осталась)
        if (!this.isReadOnly) {
            document.getElementById('prev-month').addEventListener('click', () => this.changeMonth(-1));
            document.getElementById('next-month').addEventListener('click', () => this.changeMonth(1));
            document.getElementById('clear-day').addEventListener('click', () => this.clearCurrentDay());
            document.getElementById('send-all').addEventListener('click', () => this.exportToJson());
        }
        
        // Модальные окна
        document.getElementById('modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('confirm-cancel').addEventListener('click', () => this.hideModal());
        document.getElementById('confirm-ok').addEventListener('click', () => this.confirmAction());
        
        document.getElementById('export-close').addEventListener('click', () => this.hideExportModal());
        document.getElementById('close-export').addEventListener('click', () => this.hideExportModal());
        document.getElementById('copy-json').addEventListener('click', () => this.copyJsonToClipboard());
    }
    
    hideLoading() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-ui').style.display = 'flex';
        setTimeout(() => {
            document.getElementById('main-ui').style.opacity = '1';
        }, 50);
    }
    
    updateMonthTitle() {
        const monthName = this.monthNames[this.currentMonth];
        document.getElementById('current-month').textContent = `${monthName} ${this.currentYear}`;
    }
    
    updateStats() {
        const daysWithShifts = Object.keys(this.schedule).length;
        const totalShifts = Object.values(this.schedule).reduce((sum, masters) => sum + masters.length, 0);
        
        document.getElementById('stats-masters').textContent = this.masters.length;
        document.getElementById('stats-days').textContent = daysWithShifts;
        document.getElementById('stats-selected').textContent = this.selectedMasters.size;
        
        document.getElementById('total-masters').textContent = this.masters.length;
        document.getElementById('selected-now').textContent = this.selectedMasters.size;
        document.getElementById('total-shifts').textContent = totalShifts;
    }
    
    changeMonth(delta) {
        if (this.isReadOnly) return;
        
        this.saveToLocalStorage();
        
        this.currentMonth += delta;
        
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        } else if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        
        this.selectedDay = null;
        this.selectedMasters.clear();
        
        this.loadFromLocalStorage();
        
        this.updateMonthTitle();
        this.renderCalendar();
        this.updateDayInfo();
        this.updateStats();
        this.renderMastersList();
        
        this.showNotification(`Переключено на ${this.monthNames[this.currentMonth]}`, 'info');
    }
    
    renderCalendar() {
        const calendarEl = document.getElementById('calendar-grid');
        calendarEl.innerHTML = '';
        
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        
        let firstDayOfWeek = firstDay.getDay();
        if (firstDayOfWeek === 0) firstDayOfWeek = 7;
        
        for (let i = 1; i < firstDayOfWeek; i++) {
            calendarEl.appendChild(this.createEmptyDay());
        }
        
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${this.currentYear}-${this.currentMonth + 1}-${day}`;
            let mastersOnDay = this.schedule[dateKey] || [];
            
            // Filter logic for View Mode
            let isDimmed = false;
            let displayMasters = mastersOnDay;
            let isHighlighted = false;

            if (this.filterMode === 'my' && this.targetMasterId) {
                const hasMe = mastersOnDay.includes(this.targetMasterId);
                if (!hasMe) {
                    isDimmed = true; // Dim days where I don't work
                } else {
                    isHighlighted = true;
                    // Optionally filter indicators to only show "Me" or show all but highlight me
                    // Let's show all but mark the day clearly
                }
            }

            const isToday = isCurrentMonth && day === today.getDate();
            const isWeekend = this.isWeekend(day);
            const isSelected = this.selectedDay === day;
            
            calendarEl.appendChild(this.createDayElement(day, {
                isToday,
                isWeekend,
                isSelected,
                hasShift: mastersOnDay.length > 0,
                mastersCount: mastersOnDay.length,
                mastersIds: mastersOnDay, // Pass IDs to check for specific master
                isDimmed,
                isHighlighted
            }));
        }
    }
    
    createEmptyDay() {
        const div = document.createElement('div');
        div.className = 'calendar-day day-empty';
        return div;
    }
    
    createDayElement(day, options) {
        const div = document.createElement('div');
        div.className = 'calendar-day';
        div.dataset.day = day;
        
        if (options.isToday) div.classList.add('day-today');
        if (options.isWeekend) div.classList.add('day-weekend');
        if (options.isSelected) div.classList.add('day-selected');
        if (options.hasShift) div.classList.add('day-shift');
        if (options.isDimmed) div.classList.add('day-dimmed');
        if (options.isHighlighted) div.classList.add('day-highlight');
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        
        const mastersIndicators = document.createElement('div');
        mastersIndicators.className = 'day-masters';
        
        const maxIndicators = 3;
        const indicatorsCount = Math.min(options.mastersCount, maxIndicators);
        
        for (let i = 0; i < indicatorsCount; i++) {
            const dot = document.createElement('div');
            dot.className = 'master-dot';
            
            // Highlight my dot
            // Note: simple logic, just coloring dots. 
            // Better logic would be to map dots to masters, but we just show count mostly.
            // If "Me" is working, make the first dot distinctive
            if (this.targetMasterId && options.mastersIds.includes(this.targetMasterId) && i === 0) {
                dot.classList.add('my-dot');
            }
            
            mastersIndicators.appendChild(dot);
        }
        
        if (options.mastersCount > maxIndicators) {
            const more = document.createElement('div');
            more.className = 'master-more';
            more.textContent = `+${options.mastersCount - maxIndicators}`;
            more.style.cssText = `
                font-size: 9px;
                color: var(--success-color);
                font-weight: bold;
                margin-left: 2px;
            `;
            mastersIndicators.appendChild(more);
        }
        
        div.appendChild(dayNumber);
        if (options.mastersCount > 0) {
            div.appendChild(mastersIndicators);
        }
        
        // В режиме просмотра клик просто показывает инфо, без "выбора" для редактирования
        // Но используем ту же функцию selectDay, просто внутри нее проверим mode
        div.addEventListener('click', () => this.selectDay(day));
        
        return div;
    }
    
    isWeekend(day) {
        const date = new Date(this.currentYear, this.currentMonth, day);
        const dayOfWeek = date.getDay();
        return dayOfWeek === 5 || dayOfWeek === 6;
    }
    
    selectDay(day) {
        this.selectedDay = day;
        
        const dateKey = `${this.currentYear}-${this.currentMonth + 1}-${day}`;
        const mastersOnDay = this.schedule[dateKey] || [];
        
        this.selectedMasters = new Set(mastersOnDay);
        
        // В режиме View перерисовываем календарь, чтобы подсветить выбранный день
        // Но в режиме Edit перерисовка нужна для логики выбора
        this.renderCalendar();
        this.updateDayInfo();
        
        // В режиме View список мастеров не обновляем "для выбора", а просто показываем
        this.renderMastersList();
        this.updateStats();
        
        if (window.innerWidth < 768) {
            setTimeout(() => {
                document.getElementById('day-info').scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'nearest'
                });
            }, 100);
        }
    }
    
    updateDayInfo() {
        const dateElement = document.getElementById('selected-date');
        const assignedList = document.getElementById('assigned-list');
        
        if (this.selectedDay) {
            const date = new Date(this.currentYear, this.currentMonth, this.selectedDay);
            const options = { weekday: 'short', day: 'numeric', month: 'long' };
            const dateStr = date.toLocaleDateString('ru-RU', options);
            
            dateElement.textContent = dateStr;
            
            assignedList.innerHTML = '';
            
            const dateKey = `${this.currentYear}-${this.currentMonth + 1}-${this.selectedDay}`;
            const mastersOnDay = this.schedule[dateKey] || [];
            
            if (mastersOnDay.length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'empty-state';
                emptyMsg.textContent = 'На этот день смена не назначена';
                assignedList.appendChild(emptyMsg);
            } else {
                mastersOnDay.forEach(masterId => {
                    const master = this.masters.find(m => m.id === masterId);
                    if (master) {
                        const item = document.createElement('div');
                        item.className = 'assigned-item';
                        if (masterId === this.targetMasterId) {
                            item.classList.add('is-me');
                        }
                        item.innerHTML = `
                            <div class="master-avatar">${master.name.charAt(0)}</div>
                            <span>${master.name}</span>
                        `;
                        assignedList.appendChild(item);
                    }
                });
            }
        } else {
            dateElement.textContent = '--';
            assignedList.innerHTML = '<p class="empty-state">Выберите день из календаря</p>';
        }
    }
    
    renderMastersList() {
        const mastersListEl = document.getElementById('masters-list');
        mastersListEl.innerHTML = '';
        
        let currentDateStr = null;
        if (this.selectedDay) {
            currentDateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(this.selectedDay).padStart(2, '0')}`;
        }

        const mastersWithStats = this.masters.map(master => {
            const shiftCount = this.getMasterShiftCount(master.id);
            const isDayOff = currentDateStr ? this.checkIfDayOff(master.id, currentDateStr) : false;
            return { ...master, shiftCount, isDayOff };
        }).sort((a, b) => {
            if (this.selectedDay) {
                if (a.isDayOff !== b.isDayOff) return a.isDayOff ? 1 : -1;
            }
            return b.shiftCount - a.shiftCount;
        });
        
        mastersWithStats.forEach(master => {
            const isSelected = this.selectedMasters.has(master.id);
            const masterEl = this.createMasterElement(master, isSelected);
            mastersListEl.appendChild(masterEl);
        });
        
        if (this.masters.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-state';
            emptyMsg.textContent = 'Мастера не загружены';
            mastersListEl.appendChild(emptyMsg);
        }
    }
    
    checkIfDayOff(masterId, dateStr) {
        return this.daysOff.some(d => d.masterId === masterId && d.date === dateStr);
    }
    
    createMasterElement(master, isSelected) {
        const div = document.createElement('div');
        div.className = 'master-item';
        
        if (master.id === this.targetMasterId) {
            div.classList.add('is-me-item');
        }

        if (isSelected) div.classList.add('selected');
        if (master.isDayOff) div.classList.add('day-off');
        
        div.dataset.masterId = master.id;
        
        const avatar = document.createElement('div');
        avatar.className = 'master-avatar';
        avatar.textContent = master.name.charAt(0);
        
        const info = document.createElement('div');
        info.className = 'master-info';
        
        const nameContainer = document.createElement('div');
        nameContainer.style.display = 'flex';
        nameContainer.style.alignItems = 'center';
        nameContainer.style.gap = '6px';
        
        const name = document.createElement('span');
        name.className = 'master-name';
        name.textContent = master.name;
        
        nameContainer.appendChild(name);
        
        if (master.isDayOff) {
            const dayOffBadge = document.createElement('span');
            dayOffBadge.textContent = '🏖️';
            dayOffBadge.title = 'Выходной';
            dayOffBadge.style.fontSize = '0.9rem';
            nameContainer.appendChild(dayOffBadge);
        }
        
        const stats = document.createElement('div');
        stats.className = 'master-stats';
        
        const shifts = document.createElement('div');
        shifts.className = 'master-shifts';
        shifts.innerHTML = `<i class="fas fa-calendar-check"></i> ${master.shiftCount}`;
        shifts.title = `Смен в этом месяце: ${master.shiftCount}`;
        
        stats.appendChild(shifts);
        info.appendChild(nameContainer);
        info.appendChild(stats);
        
        div.appendChild(avatar);
        div.appendChild(info);
        
        if (master.isDayOff) {
             div.title = "Мастер отметил этот день как выходной";
        }

        // В режиме просмотра клик по мастеру ничего не делает (или можно сделать фильтрацию по клику)
        if (!this.isReadOnly) {
            div.addEventListener('click', () => this.toggleMasterSelection(master.id));
        }
        
        return div;
    }
    
    getMasterShiftCount(masterId) {
        let count = 0;
        Object.values(this.schedule).forEach(mastersOnDay => {
            if (mastersOnDay.includes(masterId)) {
                count++;
            }
        });
        return count;
    }
    
    toggleMasterSelection(masterId) {
        if (this.isReadOnly) return;

        if (!this.selectedDay) {
            this.showNotification('Сначала выберите день из календаря', 'error');
            return;
        }
        
        const dateKey = `${this.currentYear}-${this.currentMonth + 1}-${this.selectedDay}`;
        
        if (!this.schedule[dateKey]) {
            this.schedule[dateKey] = [];
        }
        
        if (this.selectedMasters.has(masterId)) {
            this.selectedMasters.delete(masterId);
            const index = this.schedule[dateKey].indexOf(masterId);
            if (index > -1) {
                this.schedule[dateKey].splice(index, 1);
            }
            
            if (this.schedule[dateKey].length === 0) {
                delete this.schedule[dateKey];
            }
        } else {
            this.selectedMasters.add(masterId);
            if (!this.schedule[dateKey].includes(masterId)) {
                this.schedule[dateKey].push(masterId);
            }
        }
        
        this.updateDayInfo();
        this.renderCalendar();
        this.renderMastersList();
        this.updateStats();
        
        this.saveToLocalStorage();
    }
    
    clearCurrentDay() {
        if (!this.selectedDay) {
            this.showNotification('Выберите день для очистки', 'error');
            return;
        }
        
        this.showConfirmModal(
            'Очистить смену на выбранный день?',
            () => {
                const dateKey = `${this.currentYear}-${this.currentMonth + 1}-${this.selectedDay}`;
                delete this.schedule[dateKey];
                
                this.selectedMasters.clear();
                
                this.updateDayInfo();
                this.renderCalendar();
                this.renderMastersList();
                this.updateStats();
                
                this.showNotification('Смена очищена', 'success');
                this.saveToLocalStorage();
            }
        );
    }
    
    exportToJson() {
        if (Object.keys(this.schedule).length === 0) {
            this.showNotification('Нет данных для экспорта', 'error');
            return;
        }
        
        const dataToExport = {
            month: this.currentMonth + 1,
            year: this.currentYear,
            chat_id: this.chatId, 
            schedule: this.schedule
        };
        
        const jsonStr = JSON.stringify(dataToExport, null, 2);
        
        const exportModal = document.getElementById('export-modal');
        const exportTextarea = document.getElementById('export-json');
        
        exportTextarea.value = jsonStr;
        exportModal.style.display = 'flex';
        
        setTimeout(() => {
            exportTextarea.select();
        }, 100);
    }
    
    hideExportModal() {
        document.getElementById('export-modal').style.display = 'none';
    }
    
    copyJsonToClipboard() {
        const textarea = document.getElementById('export-json');
        textarea.select();
        
        try {
            document.execCommand('copy');
            this.showNotification('JSON скопирован! Отправьте его боту', 'success');
        } catch (err) {
            console.error('Ошибка копирования:', err);
            this.showNotification('Не удалось скопировать текст', 'error');
        }
    }
    
    showConfirmModal(message, onConfirm) {
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-modal').style.display = 'flex';
        
        this.pendingConfirm = onConfirm;
    }
    
    hideModal() {
        document.getElementById('confirm-modal').style.display = 'none';
        this.pendingConfirm = null;
    }
    
    confirmAction() {
        if (this.pendingConfirm) {
            this.pendingConfirm();
        }
        this.hideModal();
    }
    
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type} show`;
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
    
    showSaveNotification() {
        const notification = document.getElementById('save-notification');
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 1500);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (e) => {
        const modalOverlays = document.querySelectorAll('.modal-overlay');
        modalOverlays.forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    window.miniApp = new ScheduleMiniApp();
});