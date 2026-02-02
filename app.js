let currentPersonId = null;
let annualChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    await refreshPersonList();
    setupEventListeners();
});

function setupEventListeners() {
    // Modales
    document.getElementById('btn-add-person').onclick = () => openModal('modal-person');
    document.getElementById('btn-open-form').onclick = () => {
        if (!currentPersonId) return alert('Seleccione una persona primero');
        openModal('modal-entry');
    };

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => closeModal(btn.closest('.modal').id);
    });

    // Formularios
    document.getElementById('form-person').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('person-name').value;
        const id = document.getElementById('edit-person-id').value;

        if (id) await updatePerson(parseInt(id), name);
        else await addPerson(name);

        closeModal('modal-person');
        refreshPersonList();
    };

    document.getElementById('form-entry').onsubmit = async (e) => {
        e.preventDefault();
        const entry = {
            personId: currentPersonId,
            date: document.getElementById('entry-date').value,
            hours: parseFloat(document.getElementById('entry-hours').value),
            courses: parseInt(document.getElementById('entry-courses').value)
        };
        const id = document.getElementById('edit-entry-id').value;

        if (id) {
            entry.id = parseInt(id);
            await updateEntry(entry);
        } else {
            await addEntry(entry);
        }

        closeModal('modal-entry');
        loadPersonData(currentPersonId);
    };

    // Búsqueda
    document.getElementById('person-search').oninput = (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.person-item').forEach(item => {
            const name = item.textContent.toLowerCase();
            item.style.display = name.includes(term) ? 'flex' : 'none';
        });
    };

    // Filtro mes
    document.getElementById('filter-month').onchange = () => loadPersonData(currentPersonId);

    // Reporte básico (Imprimir)
    document.getElementById('btn-show-report').onclick = () => {
        if (!currentPersonId) return;
        window.print();
    };

    // Reporte Mensajería (Copiar al portapapeles)
    document.getElementById('btn-msg-report').onclick = async () => {
        if (!currentPersonId) return alert('Seleccione una persona primero');

        const personName = document.getElementById('selected-person-name').textContent;
        const filterMonth = document.getElementById('filter-month').value; // YYYY-MM
        const [year, month] = filterMonth.split('-');

        // Nombres de los meses en español
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const monthText = monthNames[parseInt(month) - 1];

        const entries = await getEntriesByPerson(currentPersonId);
        const monthlyEntries = entries.filter(e => e.date.startsWith(filterMonth));

        const totalHours = monthlyEntries.reduce((sum, e) => sum + e.hours, 0);
        const totalCourses = monthlyEntries.reduce((sum, e) => sum + e.courses, 0);

        const reportText = `Informe
${monthNames[parseInt(month) - 1]} ${year}
Nombre: ${personName}
Horas: ${totalHours.toFixed(1)}
Cursos: ${totalCourses}
Saludos`;

        const success = await copyToClipboard(reportText);
        if (success) {
            alert('¡Reporte copiado al portapapeles!\n\n' + reportText);
        } else {
            // Fallback: Si no puede copiar, mostramos un prompt para que el usuario solo tenga que dar a Cmd+C
            window.prompt("Tu navegador bloquea el copiado automático en archivos locales.\nPresiona Cmd+C para copiar este reporte:", reportText);
        }
    };
}

async function copyToClipboard(text) {
    // 1. Intentar con API moderna (solo en HTTPS o Localhost)
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Continuar al fallback si falla la API
        }
    }

    // 2. Fallback clásico de Textarea
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.style.opacity = "0"; // Asegurar que no se vea
        document.body.appendChild(textArea);
        textArea.select();
        textArea.setSelectionRange(0, 99999); // Para móviles y navegadores antiguos

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
    } catch (err) {
        return false;
    }
}

async function refreshPersonList() {
    const persons = await getAllPersons();
    const list = document.getElementById('person-list');
    list.innerHTML = '';

    persons.forEach(p => {
        const div = document.createElement('div');
        div.className = `person-item ${p.id === currentPersonId ? 'active' : ''}`;
        div.innerHTML = `<span>${p.name}</span>`;
        div.onclick = () => selectPerson(p.id, p.name);
        list.appendChild(div);
    });
}

function selectPerson(id, name) {
    currentPersonId = id;
    document.getElementById('selected-person-name').textContent = name;
    document.querySelectorAll('.person-item').forEach(item => {
        item.classList.toggle('active', item.textContent === name);
    });

    // Reset month filter to current month
    const now = new Date();
    document.getElementById('filter-month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    loadPersonData(id);
}

async function loadPersonData(personId) {
    const entries = await getEntriesByPerson(personId);
    const filterMonth = document.getElementById('filter-month').value; // YYYY-MM

    // Filtrar por mes para estadísticas
    const monthlyEntries = entries.filter(e => e.date.startsWith(filterMonth));
    const annualEntries = entries.filter(e => e.date.startsWith(filterMonth.split('-')[0]));

    renderDashboard(monthlyEntries, annualEntries);
    renderTable(entries);
}

function renderDashboard(monthly, annual) {
    // Mensual 55h
    const totalHoursMonth = monthly.reduce((sum, e) => sum + e.hours, 0);
    const totalCoursesMonth = monthly.reduce((sum, e) => sum + e.courses, 0);

    const monthlyPercent = Math.min((totalHoursMonth / 55) * 100, 100);
    const bar = document.getElementById('monthly-progress-bar');
    bar.style.width = `${monthlyPercent}%`;

    // Lógica de color: naranja -> verde
    if (totalHoursMonth >= 55) bar.style.backgroundColor = 'var(--green-goal)';
    else bar.style.backgroundColor = 'var(--orange-goal)';

    document.getElementById('monthly-current').textContent = `${totalHoursMonth.toFixed(1)}h`;
    document.getElementById('monthly-courses').textContent = totalCoursesMonth;

    // Anual 600h
    const totalHoursYear = annual.reduce((sum, e) => sum + e.hours, 0);
    renderAnnualChart(totalHoursYear);
}

function renderAnnualChart(total) {
    const ctx = document.getElementById('annual-chart').getContext('2d');
    const remaining = Math.max(0, 600 - total);
    const extra = Math.max(0, total - 600);

    if (annualChart) annualChart.destroy();

    annualChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Completado', 'Restante', 'Extra'],
            datasets: [{
                data: [Math.min(total, 600), remaining, extra],
                backgroundColor: ['#22c55e', '#f97316', '#3b82f6'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '70%',
            plugins: { legend: { display: false } },
            responsive: true,
            maintainAspectRatio: false
        }
    });

    document.getElementById('annual-status').innerHTML = `
        Progreso: <strong>${total.toFixed(1)}h</strong> / 600h 
        ${extra > 0 ? `<br><span style="color:#3b82f6">¡Extra: +${extra.toFixed(1)}h!</span>` : ''}
    `;
}

function renderTable(entries) {
    const tbody = document.getElementById('records-body');
    tbody.innerHTML = '';

    entries.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(e.date).toLocaleDateString()}</td>
            <td>${e.hours}h</td>
            <td>${e.courses}</td>
            <td>
                <button class="btn secondary" onclick="editEntryUI(${e.id}, '${e.date}', ${e.hours}, ${e.courses})">Editar</button>
                <button class="btn" style="color:red" onclick="deleteEntryUI(${e.id})">Borrar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// UI Helpers
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    document.getElementById('form-person').reset();
    document.getElementById('form-entry').reset();
    document.getElementById('edit-person-id').value = '';
    document.getElementById('edit-entry-id').value = '';
}

window.editEntryUI = (id, date, hours, courses) => {
    document.getElementById('edit-entry-id').value = id;
    document.getElementById('entry-date').value = date;
    document.getElementById('entry-hours').value = hours;
    document.getElementById('entry-courses').value = courses;
    openModal('modal-entry');
};

window.deleteEntryUI = async (id) => {
    if (confirm('¿Seguro que desea borrar este registro?')) {
        await deleteEntry(id);
        loadPersonData(currentPersonId);
    }
};
