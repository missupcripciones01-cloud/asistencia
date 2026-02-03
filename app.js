let annualChart = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar UI inmediatamente para que los botones respondan
    setupNavigation();
    setupNamesModal();
    setupConfigModal();
    setupGlobalModalClosing();
    setupReportAction();
    setupZoomTableActions();
    setupSaveAction();
    setupDateSelector();

    // 2. Inicializar DB y Datos de forma asíncrona
    try {
        await initDB();
        await updateSuggestions();

        // Inicializar con la fecha de hoy
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('meeting-date').value = today;
        await loadDateData(today);
    } catch (err) {
        console.error("Fallo en la inicialización:", err);
        document.getElementById('db-status').textContent = "Error de Sistema";
    }
});

// --- Navegación ---
function setupNavigation() {
    // Solo actuar sobre botones que tienen data-tab (las pestañas reales)
    document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
        btn.onclick = async () => {
            const tabId = btn.getAttribute('data-tab');
            if (!tabId) return;

            // Limpiar estados activos de pestañas
            document.querySelectorAll('.nav-item[data-tab]').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

            // Activar nueva pestaña
            btn.classList.add('active');
            const targetTab = document.getElementById(tabId);
            if (targetTab) targetTab.classList.add('active');

            if (tabId === 'evolution-tab') {
                await renderEvolutionChart();
            }
        };
    });
}

// --- Gestión de Fecha ---
function setupDateSelector() {
    const dateInput = document.getElementById('meeting-date');
    dateInput.onchange = async () => {
        await loadDateData(dateInput.value);
    };
}

async function loadDateData(date) {
    const meeting = await getMeeting(date);
    const zoomEntries = await getZoomEntries(date);

    // Reset UI
    const presencialInput = document.getElementById('private-attendance-total');
    if (presencialInput) presencialInput.value = meeting ? meeting.presencial : 0;
    const body = document.getElementById('zoom-body');
    body.innerHTML = '';

    if (zoomEntries && zoomEntries.length > 0) {
        // Ordenar alfabéticamente por nombre
        zoomEntries.sort((a, b) => a.name.localeCompare(b.name));
        zoomEntries.forEach(entry => addZoomRow(entry.name, entry.connections));
    } else {
        addZoomRow(); // Una fila vacía por defecto
    }

    nxCalculateTotals();
}

// --- Gestión de Tabla Zoom ---
function setupZoomTableActions() {
    document.getElementById('btn-add-zoom').onclick = () => addZoomRow();

    const presencialInput = document.getElementById('private-attendance-total');
    if (presencialInput) presencialInput.oninput = nxCalculateTotals;
}

function addZoomRow(name = '', connections = 1) {
    const body = document.getElementById('zoom-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="row-name">
            <input type="text" class="zoom-name nx-secure-input" value="${name}" 
                placeholder="Nombre del asistente..." 
                autocomplete="new-password" 
                autocorrect="off" 
                autocapitalize="off" 
                spellcheck="false"
                data-lpignore="true">
        </td>
        <td class="row-count">
            <input type="number" class="zoom-count" min="1" value="${connections}" autocomplete="new-password">
        </td>
        <td>
            <button class="btn-delete" title="Eliminar">🗑️</button>
        </td>
    `;

    tr.querySelector('.btn-delete').onclick = () => {
        tr.remove();
        nxCalculateTotals();
    };

    const nameInput = tr.querySelector('.nx-secure-input');
    nameInput.oninput = (e) => {
        nxCalculateTotals();
        showSuggestions(e.target);
    };

    nameInput.onfocus = (e) => showSuggestions(e.target);
    nameInput.onblur = () => setTimeout(hideSuggestions, 200);

    body.appendChild(tr);
    nxCalculateTotals();
}

// --- Cálculos y Totales (Privacidad Reforzada) ---
function nxCalculateTotals() {
    const presencialInput = document.getElementById('private-attendance-total');
    const presencial = presencialInput ? (parseInt(presencialInput.value) || 0) : 0;
    let zoomTotal = 0;

    document.querySelectorAll('.zoom-count').forEach(input => {
        zoomTotal += parseInt(input.value) || 0;
    });

    const total = presencial + zoomTotal;

    document.getElementById('val-presencial').textContent = presencial;
    document.getElementById('val-zoom').textContent = zoomTotal;
    document.getElementById('val-total').textContent = total;

    // Visual feedback
    const totalValueEl = document.getElementById('val-total');
    totalValueEl.style.transform = 'scale(1.1)';
    setTimeout(() => totalValueEl.style.transform = 'scale(1)', 100);
}

// --- Sugerencias Personalizadas (Privacidad Total) ---
let masterNamesCache = [];

async function showSuggestions(input) {
    if (masterNamesCache.length === 0) {
        const names = await getMasterNames();
        masterNamesCache = names.map(n => n.name).sort();
    }

    const val = input.value.toLowerCase();
    const suggestions = masterNamesCache.filter(name =>
        name.toLowerCase().includes(val)
    );

    const div = document.getElementById('custom-suggestions');
    if (suggestions.length === 0) {
        div.style.display = 'none';
        return;
    }

    div.innerHTML = '';
    suggestions.slice(0, 10).forEach(name => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.textContent = name;
        item.onclick = () => {
            input.value = name;
            nxCalculateTotals();
            hideSuggestions();
        };
        div.appendChild(item);
    });

    const rect = input.getBoundingClientRect();
    div.style.left = `${rect.left}px`;
    div.style.top = `${rect.bottom}px`; // Eliminado window.scrollY porque el contenedor es fixed
    div.style.width = `${rect.width}px`;
    div.style.display = 'block';
}

function hideSuggestions() {
    document.getElementById('custom-suggestions').style.display = 'none';
}

async function updateSuggestions() {
    const names = await getMasterNames();
    masterNamesCache = names.map(n => n.name).sort();
}

// --- Guardado ---
function setupSaveAction() {
    document.getElementById('btn-save-all').onclick = async () => {
        const date = document.getElementById('meeting-date').value;
        const presencialInput = document.getElementById('private-attendance-total');
        const presencial = presencialInput ? (parseInt(presencialInput.value) || 0) : 0;

        const zoomEntries = [];
        document.querySelectorAll('#zoom-body tr').forEach(tr => {
            const name = tr.querySelector('.zoom-name').value.trim();
            const connections = parseInt(tr.querySelector('.zoom-count').value) || 0;
            if (name !== "" || connections > 0) {
                zoomEntries.push({ date, name, connections });
            }
        });

        const zoomTotal = zoomEntries.reduce((sum, e) => sum + e.connections, 0);
        const total = presencial + zoomTotal;

        await saveMeeting({ date, presencial, total });
        await saveZoomEntries(date, zoomEntries);

        alert('¡Registro guardado con éxito!');
    };
}

// --- Gestión de Modal de Nombres ---
function setupNamesModal() {
    const modal = document.getElementById('modal-names');
    const btnOpen = document.getElementById('btn-open-names-modal');
    const btnSave = document.getElementById('btn-save-names');
    const textArea = document.getElementById('import-names-area');

    btnOpen.onclick = () => {
        textArea.value = "";
        modal.style.display = 'flex';
    };

    btnSave.onclick = async () => {
        const text = textArea.value;
        const names = text.split('\n')
            .map(n => n.trim())
            .filter(n => n !== "");

        if (names.length === 0) return alert("Por favor, pegue algunos nombres primero.");

        try {
            await saveMasterNames(names);
            await updateSuggestions();
            modal.style.display = 'none';
            alert(`¡Se han importado ${names.length} nombres correctamente!`);
        } catch (err) {
            console.error(err);
            alert("Error al guardar los nombres.");
        }
    };
}

// La función updateSuggestions ahora se gestiona en la sección de Sugerencias Personalizadas

// --- Gestión de Reportes ---
function setupReportAction() {
    const modal = document.getElementById('modal-report');
    const btnOpen = document.getElementById('btn-open-report');
    const btnPrint = document.getElementById('btn-print-pdf');
    const btnWhatsApp = document.getElementById('btn-copy-whatsapp');

    btnOpen.onclick = () => {
        generateReportPreview();
        modal.style.display = 'flex';
    };

    btnPrint.onclick = () => window.print();

    btnWhatsApp.onclick = () => {
        const text = generateWhatsAppText();
        copyToClipboard(text);
    };
}

function getFormattedDateLong(dateStr) {
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const date = new Date(dateStr + "T12:00:00"); // Evitar problemas de zona horaria
    let formatted = new Intl.DateTimeFormat('es-ES', options).format(date);
    // Capitalizar primera letra y mes (según pedido del usuario del estilo)
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function generateReportPreview() {
    const dateStr = document.getElementById('meeting-date').value;
    const dateLong = getFormattedDateLong(dateStr);
    const presencial = document.getElementById('val-presencial').textContent;
    const zoom = document.getElementById('val-zoom').textContent;

    // Obtener y ordenar asistentes actuales
    const entries = [];
    document.querySelectorAll('#zoom-body tr').forEach(tr => {
        const name = tr.querySelector('.zoom-name').value.trim();
        const connections = parseInt(tr.querySelector('.zoom-count').value) || 0;
        if (name) entries.push({ name, connections });
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    let tableRows = entries.map(e => `
        <tr>
            <td>${e.name}</td>
            <td style="text-align: right; font-weight: bold;">${e.connections}</td>
        </tr>
    `).join('');

    const html = `
        <div class="report-header">
            <h1>Reporte de Asistencia</h1>
            <p>${dateLong}</p>
        </div>
        <div class="report-summary-box">
            <div class="summary-item">
                <span class="label">Presencial</span>
                <span class="value">${presencial}</span>
            </div>
            <div class="summary-item">
                <span class="label">Por Zoom</span>
                <span class="value">${zoom}</span>
            </div>
            <div class="summary-item" style="border-top-color: #10b981;">
                <span class="label">Total</span>
                <span class="value">${parseInt(presencial) + parseInt(zoom)}</span>
            </div>
        </div>
        <h3>Detalle de Conexiones Zoom</h3>
        <table class="report-table">
            <thead>
                <tr>
                    <th>Nombre del Asistente</th>
                    <th style="text-align: right;">Cantidad</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows || '<tr><td colspan="2" style="text-align:center; color:#94a3b8;">Sin registros de Zoom</td></tr>'}
            </tbody>
        </table>
    `;

    document.getElementById('report-preview').innerHTML = html;
}

function generateWhatsAppText() {
    const dateStr = document.getElementById('meeting-date').value;
    const dateLong = getFormattedDateLong(dateStr);
    const presencial = document.getElementById('val-presencial').textContent;
    const zoom = document.getElementById('val-zoom').textContent;
    const total = parseInt(presencial) + parseInt(zoom);

    const entries = [];
    document.querySelectorAll('#zoom-body tr').forEach(tr => {
        const name = tr.querySelector('.zoom-name').value.trim();
        const connections = parseInt(tr.querySelector('.zoom-count').value) || 0;
        if (name) entries.push({ name, connections });
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    let text = `*RESUMEN DE ASISTENCIA*\n`;
    text += `📅 ${dateLong}\n\n`;
    text += `👥 *Asistencia Presencial:* ${presencial}\n`;
    text += `💻 *Asistencia por Zoom:* ${zoom}\n`;
    text += `✅ *TOTAL:* ${total}\n\n`;
    text += `*DETALLE ZOOM:*\n`;

    entries.forEach(e => {
        text += `• ${e.name}: ${e.connections}\n`;
    });

    return text;
}

function copyToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        alert("¡Reporte copiado al portapapeles para WhatsApp!");
    } catch (err) {
        prompt("Copia el reporte manualmente:", text);
    }
    document.body.removeChild(textArea);
}

// --- Gráficos de Evolución ---
async function renderEvolutionChart() {
    const allMeetings = await getAllMeetings();
    // Ordenar por fecha
    allMeetings.sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = allMeetings.map(m => {
        const d = new Date(m.date);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    });
    const dataTotal = allMeetings.map(m => m.total);
    const dataZoom = allMeetings.map(m => m.total - m.presencial);

    const ctx = document.getElementById('annual-evolution-chart').getContext('2d');

    if (annualChart) annualChart.destroy();

    annualChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Asistencia Total',
                    data: dataTotal,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6'
                },
                {
                    label: 'Solo Zoom',
                    data: dataZoom,
                    borderColor: '#10b981',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: { weight: 'bold' } } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });

    // Estadísticas
    if (dataTotal.length > 0) {
        const max = Math.max(...dataTotal);
        const avg = dataTotal.reduce((a, b) => a + b, 0) / dataTotal.length;
        document.getElementById('stat-max').textContent = max;
        document.getElementById('stat-avg').textContent = avg.toFixed(1);
    }
}

// --- Configuración y Portabilidad ---
function setupConfigModal() {
    const modal = document.getElementById('modal-config');
    const btnOpen = document.getElementById('btn-open-config-modal');
    const btnExport = document.getElementById('btn-export-json');
    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const importFile = document.getElementById('import-file');

    btnOpen.onclick = () => modal.style.display = 'flex';

    btnExport.onclick = async () => {
        const data = await exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AttendanceMaster_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    btnImportTrigger.onclick = () => importFile.click();

    importFile.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = event.target.result;
                await importData(json);
                alert('¡Datos importados con éxito! La página se recargará para mostrar los cambios.');
                location.reload();
            } catch (err) {
                console.error(err);
                alert('Error al importar el archivo. Asegúrate de que es un archivo JSON válido de AttendanceMaster.');
            }
        };
        reader.readAsText(file);
    };
}

// --- Utilidades Globales ---
function setupGlobalModalClosing() {
    // Cerrar al pulsar el botón de cerrar
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        };
    });

    // Cerrar al pulsar fuera del contenido (en el fondo oscuro)
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };
}
