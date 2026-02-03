class ScheduleMiniApp {
    constructor() {
        this.currentDate = new Date();
        this.currentYear = this.currentDate.getFullYear();
        this.currentMonth = this.currentDate.getMonth(); // 0-11
        this.selectedDay = null;
        this.masters = [];
        this.schedule = {};
        this.selectedMasters = new Set();
        
        this.monthNames = [
            "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
            "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
        ];
        
        this.init();
    }
    
    async init() {
        try {
            // Загружаем данные из URL параметров
            await this.loadDataFromURL();
            
            // Загружаем сохраненные данные из localStorage
            this.loadFromLocalStorage();
            
            // Инициализируем интерфейс
            this.initUI();
            
            // Рендерим календарь и список мастеров
            this.renderCalendar();
            this.renderMastersList();
            
            // Скрываем экран загрузки
            this.hideLoading();
            
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            this.showNotification('Ошибка загрузки данных', 'error');
        }
    }
    
    async loadDataFromURL() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const dataParam = urlParams.get('data');
            
            if (!dataParam) {
                throw new Error('No data parameter found');
            }
            
            // Декодируем данные
            const decodedParam = decodeURIComponent(dataParam);
            const jsonStr = atob(decodedParam);
            const mastersData = JSON.parse(jsonStr);
            
            // Конвертируем в объекты
            this.masters = mastersData.map(master => ({
                id: master[0],
                name: master[1]
            }));
            
            console.log(`Загружено ${this.masters.length} мастеров`);
            
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
                console.log(`Загружено расписание из localStorage:`, this.schedule);
            }
        } catch (error) {
            console.error('Ошибка загрузки из localStorage:', error);
        }
    }
    
    saveToLocalStorage() {
        try {
            const key = `schedule_${this.currentYear}_${this.currentMonth + 1}`;
            localStorage.setItem(key, JSON.stringify(this.schedule));
            
            // Показываем уведомление о сохранении
            this.showSaveNotification();
        } catch (error) {
            console.error('Ошибка сохранения в localStorage:', error);
        }
    }
    
    initUI() {
        // Обновляем заголовок месяца
        this.updateMonthTitle();
        
        // Статистика
        this.updateStats();
        
        // Назначаем обработчики событий
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Навигация по месяцам
        document.getElementById('prev-month').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('next-month').addEventListener('click', () => this.changeMonth(1));
        
        // Кнопки управления
        document.getElementById('save-day').addEventListener('click', () => this.saveCurrentDay());
        document.getElementById('clear-day').addEventListener('click', () => this.clearCurrentDay());
        document.getElementById('export-json').addEventListener('click', () => this.exportToJson());
        document.getElementById('send-all').addEventListener('click', () => this.exportToJson());
        
        // Поиск мастеров
        document.getElementById('search-masters').addEventListener('input', (e) => this.searchMasters(e.target.value));
    }
    
    hideLoading() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main-ui').style.display = 'flex';
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
            const mastersOnDay = this.schedule[dateKey] || [];
            const isToday = isCurrentMonth && day === today.getDate();
            const isWeekend = this.isWeekend(day);
            const isSelected = this.selectedDay === day;
            
            calendarEl.appendChild(this.createDayElement(day, {
                isToday,
                isWeekend,
                isSelected,
                hasShift: mastersOnDay.length > 0,
                mastersCount: mastersOnDay.length
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
        
        for (let i = 0; i < indicatorsCount; i++) {
            const dot = document.createElement('div');
            dot.className = 'master-dot';
            mastersIndicators.appendChild(dot);
        }
        
        if (options.mastersCount > maxIndicators) {
            const more = document.createElement('div');
            more.className = 'master-more';
            more.textContent = `+${options.mastersCount - maxIndicators}`;
            more.style.cssText = `
                font-size: 9px;
                color: #20c997;
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
        return dayOfWeek === 0 || dayOfWeek === 6;
    }
    
    selectDay(day) {
        this.selectedDay = day;
        
        const dateKey = `${this.currentYear}-${this.currentMonth + 1}-${day}`;
        const mastersOnDay = this.schedule[dateKey] || [];
        
        this.selectedMasters = new Set(mastersOnDay);
        
        this.renderCalendar();
        this.updateDayInfo();
        this.renderMastersList();
        this.updateStats();
        
        document.getElementById('day-info').scrollIntoView({ 
            behavior: 'smooth',
            block: 'nearest'
        });
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
                        item.innerHTML = `
                            <i class="fas fa-user"></i>
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
    
    searchMasters(query) {
        const searchTerm = query.toLowerCase().trim();
        
        if (!searchTerm) {
            this.renderMastersList();
            return;
        }
        
        const filteredMasters = this.masters.filter(master =>
            master.name.toLowerCase().includes(searchTerm)
        );
        
        this.renderMastersList(filteredMasters);
    }
    
    renderMastersList(mastersToShow = null) {
        const mastersListEl = document.getElementById('masters-list');
        const masters = mastersToShow || this.masters;
        
        mastersListEl.innerHTML = '';
        
        const mastersWithStats = masters.map(master => {
            const shiftCount = this.getMasterShiftCount(master.id);
            return { ...master, shiftCount };
        }).sort((a, b) => b.shiftCount - a.shiftCount);
        
        mastersWithStats.forEach(master => {
            const isSelected = this.selectedMasters.has(master.id);
            const masterEl = this.createMasterElement(master, isSelected);
            mastersListEl.appendChild(masterEl);
        });
        
        if (masters.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-state';
            emptyMsg.textContent = 'Мастера не найдены';
            mastersListEl.appendChild(emptyMsg);
        }
    }
    
    createMasterElement(master, isSelected) {
        const div = document.createElement('div');
        div.className = 'master-item';
        if (isSelected) div.classList.add('selected');
        div.dataset.masterId = master.id;
        
        const checkbox = document.createElement('div');
        checkbox.className = 'master-checkbox';
        if (isSelected) {
            checkbox.innerHTML = '<i class="fas fa-check"></i>';
        }
        
        const info = document.createElement('div');
        info.className = 'master-info';
        
        const name = document.createElement('div');
        name.className = 'master-name';
        name.textContent = master.name;
        
        const shifts = document.createElement('div');
        shifts.className = 'master-shifts';
        shifts.textContent = master.shiftCount;
        shifts.title = `Смен в этом месяце: ${master.shiftCount}`;
        
        info.appendChild(name);
        info.appendChild(shifts);
        
        div.appendChild(checkbox);
        div.appendChild(info);
        
        div.addEventListener('click', () => this.toggleMasterSelection(master.id));
        
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
    
    saveCurrentDay() {
        if (!this.selectedDay) {
            this.showNotification('Выберите день для сохранения', 'error');
            return;
        }
        
        const dateKey = `${this.currentYear}-${this.currentMonth + 1}-${this.selectedDay}`;
        
        if (this.selectedMasters.size === 0) {
            delete this.schedule[dateKey];
            this.showNotification('Смена очищена', 'info');
        } else {
            this.showNotification('Смена сохранена', 'success');
        }
        
        this.updateDayInfo();
        this.renderCalendar();
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
            schedule: this.schedule
        };
        
        const jsonStr = JSON.stringify(dataToExport, null, 2);
        
        this.showExportModal(jsonStr);
    }
    
    showExportModal(jsonData) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        
        modal.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div class="modal-header">
                    <h3><i class="fas fa-file-export"></i> Экспорт графика</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>Скопируйте весь текст ниже и отправьте его боту в Telegram:</p>
                    <textarea id="export-json" readonly 
                        style="width: 100%; height: 300px; font-family: monospace; 
                               padding: 10px; border: 1px solid #ddd; border-radius: 5px;
                               font-size: 12px; margin: 10px 0;">
${jsonData}
                    </textarea>
                    <p style="color: #666; font-size: 0.9rem; margin-top: 15px;">
                        <b>Инструкция:</b><br>
                        1. Скопируйте весь текст из поля выше<br>
                        2. Перейдите в Telegram и отправьте этот текст боту<br>
                        3. Бот подтвердит сохранение графика
                    </p>
                </div>
                <div class="modal-footer">
                    <button id="copy-json" class="btn btn-primary">
                        <i class="fas fa-copy"></i> Скопировать JSON
                    </button>
                    <button id="close-export" class="btn">
                        Закрыть
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('#close-export').addEventListener('click', () => modal.remove());
        
        modal.querySelector('#copy-json').addEventListener('click', () => {
            const textarea = modal.querySelector('#export-json');
            textarea.select();
            document.execCommand('copy');
            this.showNotification('JSON скопирован!', 'success');
        });
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
    window.miniApp = new ScheduleMiniApp();
});