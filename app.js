let db = JSON.parse(localStorage.getItem('userHoursDB')) || { hours: [], courses: [] };
let monthlyChart;

// Inicialización
function init() {
    initCharts();
    updateUI();
    setupTabs();
}

// Configuración de Gráfica (Chart.js)
function initCharts() {
    const ctx = document.getElementById('monthly-chart').getContext('2d');
    monthlyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
            datasets: [{
                label: 'Horas esta semana',
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: '#007aff',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Actualizar Estadísticas y Listas
function updateUI() {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    const monthTotal = db.hours
        .filter(h => {
            const d = new Date(h.date);
            return d.getMonth() === curMonth && d.getFullYear() === curYear;
        })
        .reduce((sum, h) => sum + h.amount, 0);

    const yearTotal = db.hours
        .filter(h => new Date(h.date).getFullYear() === curYear)
        .reduce((sum, h) => sum + h.amount, 0);

    document.getElementById('month-hours').innerText = monthTotal;
    document.getElementById('year-hours').innerText = yearTotal;
    document.getElementById('courses-count').innerText = db.courses.length;

    renderLists();
}

function renderLists() {
    const hList = document.getElementById('hours-list');
    hList.innerHTML = db.hours.slice(-8).reverse().map(h => `
        <li class="data-item">
            <div><strong>${h.amount}h</strong> <small>${h.date}</small></div>
            <span style="font-size:0.7rem; color:gray">${h.notes || ''}</span>
        </li>
    `).join('');

    const cList = document.getElementById('courses-list');
    cList.innerHTML = db.courses.map(c => `
        <li class="data-item">
            <span>Curso #${c.id}</span>
            <small>${c.date}</small>
        </li>
    `).join('');
}

// Modales y Guardado
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.getElementById('save-hour-btn').onclick = () => {
    const date = document.getElementById('hour-date').value;
    const amount = parseFloat(document.getElementById('hour-amount').value);
    if(date && amount) {
        db.hours.push({ date, amount, notes: document.getElementById('hour-notes').value });
        saveData();
        closeModal('hour-modal');
    }
};

document.getElementById('save-course-btn').onclick = () => {
    const id = document.getElementById('course-name').value;
    const date = document.getElementById('course-date').value;
    if(id && date) {
        db.courses.push({ id, date });
        saveData();
        closeModal('course-modal');
    }
};

function saveData() {
    localStorage.setItem('userHoursDB', JSON.stringify(db));
    updateUI();
}

// Exportar e Importar (Sincronización iCloud/AirDrop)
document.getElementById('export-btn').onclick = () => {
    const blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_horas_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
};

document.getElementById('import-btn').onclick = () => document.getElementById('import-input').click();

document.getElementById('import-input').onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            db = JSON.parse(ev.target.result);
            saveData();
            alert("Sincronización completada.");
        } catch (err) { alert("Archivo no válido."); }
    };
    reader.readAsText(file);
};

// Pestañas
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
        }
    });
}

// Registro del Service Worker para PWA
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.onload = init;
document.getElementById('add-hour-btn').onclick = () => document.getElementById('hour-modal').style.display = 'flex';
document.getElementById('add-course-btn').onclick = () => document.getElementById('course-modal').style.display = 'flex';