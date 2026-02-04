class ScheduleMiniApp {
    constructor() {
        this.currentDate = new Date();
        this.currentYear = this.currentDate.getFullYear();
        this.currentMonth = this.currentDate.getMonth(); // 0-11
        this.selectedDay = null;
        this.masters = [];
        this.daysOff = []; 
        // Структура schedule теперь: { "YYYY-MM-DD": { masterId: 'full' | 'evening', ... } }
        this.schedule = {};
        this.selectedMasters = new Map(); // Map<MasterId, ShiftType>
        this.chatId = null;
        
        // Новые свойства для View Mode
        this.mode = 'edit'; // 'edit' or 'view'
        this.targetMasterId = null; // ID "меня" для фильтрации (оставляем только для подсветки в списке)
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
            
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.showNotification('Ошибка загрузки данных', 'error');
        }
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
            
            // FIX: Восстанавливаем Base64 из URL-safe формата (заменяем - на +, _ на /)
            let base64 = dataParam.replace(/-/g, '+').replace(/_/g, '/');
            // Добавляем padding, если нужно
            while (base64.length % 4) {
                base64 += '=';
            }

            // Декодируем стандартный Base64
            const jsonStr = atob(base64);
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
                    this.schedule = this.convertLegacySchedule(parsedData.s);
                }
                
                // Если передали год/месяц, устанавливаем их
                if (parsedData.year && parsedData.month) {
                    this.currentYear = parsedData.year;
                    this.currentMonth = parsedData.month - 1; // JS months are 0-indexed
                }
                
                // Если передали ID текущего мастера (для подсветки)
                if (parsedData.target_master_id) {
                    this.targetMasterId = parseInt(parsedData.target_master_id, 10);
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
    
    // Преобразование старого формата списка ID в новый формат Map
    convertLegacySchedule(legacySchedule) {
        const newSchedule = {};
        for (const [date, value] of Object.entries(legacySchedule)) {
            newSchedule[date] = {};
            if (Array.isArray(value)) {
                // Если это список ID, считаем их всех 'full'
                value.forEach(id => {
                    newSchedule[date][id] = 'full';
                });
            } else {
                // Если это уже объект (новый формат), используем как есть
                newSchedule[date] = value;
            }
        }
        return newSchedule;
    }
    
    loadFromLocalStorage() {
        try {
            const key = `schedule_${this.currentYear}_${this.currentMonth + 1}`;
            const savedData = localStorage.getItem(key);
            
            if (savedData) {
                const parsed = JSON.parse(savedData);
                this.schedule = this.convertLegacySchedule(parsed);
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
        // Подсчет смен теперь сложнее, так как schedule[date] это объект
        const totalShifts = Object.values(this.schedule).reduce((sum, dateMap) => sum + Object.keys(dateMap).length, 0);
        
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
            const dateKey = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // mastersOnDayMap: { masterId: 'type', ... }
            let mastersOnDayMap = this.schedule[dateKey] || {};
            let mastersCount = Object.keys(mastersOnDayMap).length;
            
            const isToday = isCurrentMonth && day === today.getDate();
            const isWeekend = this.isWeekend(day);
            const isSelected = this.selectedDay === day;
            
            calendarEl.appendChild(this.createDayElement(day, {
                isToday,
                isWeekend,
                isSelected,
                hasShift: mastersCount > 0,
                mastersCount: mastersCount,
                mastersMap: mastersOnDayMap
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
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        
        const mastersIndicators = document.createElement('div');
        mastersIndicators.className = 'day-masters';
        
        const maxIndicators = 3;
        const indicatorsCount = Math.min(options.mastersCount, maxIndicators);
        const mastersValues = Object.values(options.mastersMap); // ['full', 'evening', ...]
        
        for (let i = 0; i < indicatorsCount; i++) {
            const dot = document.createElement('div');
            dot.className = 'master-dot';
            
            // Если смена вечерняя - добавляем класс
            if (mastersValues[i] === 'evening') {
                dot.classList.add('evening');
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
        
        const dateKey = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // Получаем Map {id: type}
        const mastersOnDayMap = this.schedule[dateKey] || {};
        
        // Преобразуем в Map для удобства работы
        this.selectedMasters = new Map();
        for (const [id, type] of Object.entries(mastersOnDayMap)) {
            this.selectedMasters.set(parseInt(id), type);
        }
        
        this.renderCalendar();
        this.updateDayInfo();
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
            
            const dateKey = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(this.selectedDay).padStart(2, '0')}`;
            const mastersOnDayMap = this.schedule[dateKey] || {};
            
            if (Object.keys(mastersOnDayMap).length === 0) {
                const emptyMsg = document.createElement('p');
                emptyMsg.className = 'empty-state';
                emptyMsg.textContent = 'На этот день смена не назначена';
                assignedList.appendChild(emptyMsg);
            } else {
                Object.entries(mastersOnDayMap).forEach(([masterIdStr, type]) => {
                    const masterId = parseInt(masterIdStr);
                    const master = this.masters.find(m => m.id === masterId);
                    if (master) {
                        const item = document.createElement('div');
                        item.className = 'assigned-item';
                        if (master.id === this.targetMasterId) {
                            item.classList.add('is-me');
                        }
                        if (type === 'evening') {
                            item.classList.add('evening');
                        }
                        
                        let icon = type === 'evening' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
                        
                        item.innerHTML = `
                            <div class="master-avatar">${master.name.charAt(0)}</div>
                            <span>${master.name}</span>
                            <div class="shift-icon" title="${type === 'evening' ? 'Вечерняя смена' : 'Полная смена'}">
                                ${icon}
                            </div>
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
            const shiftType = this.selectedMasters.get(master.id); // undefined, 'full', 'evening'
            const masterEl = this.createMasterElement(master, shiftType);
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
    
    createMasterElement(master, shiftType) {
        const div = document.createElement('div');
        div.className = 'master-item';
        
        if (master.id === this.targetMasterId) {
            div.classList.add('is-me-item');
        }

        if (shiftType) {
            div.classList.add('selected');
            if (shiftType === 'evening') {
                div.classList.add('evening');
            }
        }
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
        
        // Иконка типа смены (если выбран)
        if (shiftType) {
             const iconDiv = document.createElement('div');
             iconDiv.className = 'master-status-icon';
             iconDiv.innerHTML = shiftType === 'evening' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
             div.appendChild(iconDiv);
        }

        if (master.isDayOff) {
             div.title = "Мастер отметил этот день как выходной";
        }

        if (!this.isReadOnly) {
            div.addEventListener('click', () => this.cycleMasterShift(master.id));
        }
        
        return div;
    }
    
    getMasterShiftCount(masterId) {
        let count = 0;
        // Перебор объекта schedule
        Object.values(this.schedule).forEach(mastersMap => {
            if (mastersMap[masterId]) {
                count++;
            }
        });
        return count;
    }
    
    // Циклическое переключение: None -> Full -> Evening -> None
    cycleMasterShift(masterId) {
        if (this.isReadOnly) return;

        if (!this.selectedDay) {
            this.showNotification('Сначала выберите день из календаря', 'error');
            return;
        }
        
        const dateKey = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(this.selectedDay).padStart(2, '0')}`;
        
        if (!this.schedule[dateKey]) {
            this.schedule[dateKey] = {};
        }
        
        const currentType = this.selectedMasters.get(masterId);
        let nextType;
        
        if (!currentType) {
            nextType = 'full';
        } else if (currentType === 'full') {
            nextType = 'evening';
        } else {
            nextType = null; // Remove
        }
        
        if (nextType) {
            this.selectedMasters.set(masterId, nextType);
            this.schedule[dateKey][masterId] = nextType;
        } else {
            this.selectedMasters.delete(masterId);
            delete this.schedule[dateKey][masterId];
            
            if (Object.keys(this.schedule[dateKey]).length === 0) {
                delete this.schedule[dateKey];
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
                const dateKey = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(this.selectedDay).padStart(2, '0')}`;
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