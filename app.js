// app.js - Dinamik va Professional Versiya

// 1. TELEGRAM WEBAPP INIT
const tg = window.Telegram.WebApp;
tg.expand();

// Rang sxemasini avtomatik sozlash (Telegram mavzusiga moslashish)
document.documentElement.style.setProperty('--tg-theme-bg', tg.themeParams.bg_color);

// 2. CONFIG
const API_BASE_URL = window.location.origin;
const BOT_USERNAME = "TurboHamyonBot"; // Username @ siz bo'lishi kerak

// State (Ilova holati)
let products = []; // Endi mahsulotlar bazadan keladi
let userBalance = 0;
let userTelegramId = null;
let currentProduct = null;
let selectedFileBase64 = null;

// 3. INTRO & INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    createExplosionParticles();
    
    setTimeout(() => {
        const intro = document.getElementById('intro-loader');
        const app = document.getElementById('app');
        if (intro) intro.style.display = 'none';
        if (app) app.style.display = 'block';
        initApp();
    }, 2200);
});

async function initApp() {
    const user = tg.initDataUnsafe.user;
    
    if (user) {
        userTelegramId = user.id;
        // User ma'lumotlarini ekranga chiqarish
        updateUI('user-name', user.first_name);
        updateUI('user-username', user.username ? '@' + user.username : 'Username yo\'q');
        updateUI('user-id', user.id);
        if (user.photo_url) document.getElementById('user-avatar').src = user.photo_url;
        
        fetchBalance();
    } else {
        userTelegramId = "123456789"; // Test uchun (Brauzerda ko'rish uchun)
        console.warn("WebApp Telegram ichida ochilmadi");
    }

    // Referal linkni shakllantirish
    const refLink = `https://t.me/${BOT_USERNAME}?start=${userTelegramId}`;
    const inputEl = document.getElementById('my-ref-link');
    if (inputEl) inputEl.value = refLink;
    
    // MAHSULOTLARNI SERVERDAN YUKLASH
    await loadProducts();
}

// 4. MAHSULOTLARNI YUKLASH VA CHIZISH
async function loadProducts() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/products`);
        products = await res.json();
        renderShop();
    } catch (e) {
        console.error("Mahsulotlarni yuklashda xato:", e);
        tg.showAlert("Mahsulotlarni yuklab bo'lmadi!");
    }
}

function renderShop() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = '';
    
    if (products.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888;">Hozircha mahsulotlar yo\'q...</p>';
        return;
    }

    products.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div class="uc-icon"><i class="fa-solid fa-gem"></i></div>
            <div class="category-badge">${prod.category}</div>
            <h3>${prod.label}</h3>
            <p class="prod-desc">${prod.description || ''}</p>
            <span class="price-tag">${formatMoney(prod.price)} UZS</span>
            <button class="buy-btn" onclick="openOrderModal(${prod.id})">
                <i class="fa-solid fa-cart-plus"></i> Sotib olish
            </button>
        `;
        container.appendChild(div);
    });
}

// 5. BUYURTMA MODAL LOGIKASI
function openOrderModal(productId) {
    currentProduct = products.find(p => p.id == productId);
    const container = document.getElementById('dynamic-fields-container');
    const title = document.getElementById('modal-title');
    
    if (!container || !currentProduct) return;

    container.innerHTML = ''; 
    title.innerText = currentProduct.category + " uchun ma'lumotlar";

    // Dinamik inputlarni yaratish (Fields bazadan array bo'lib keladi)
    const fields = Array.isArray(currentProduct.fields) ? currentProduct.fields : JSON.parse(currentProduct.fields || "[]");
    
    fields.forEach(field => {
        const input = document.createElement('input');
        input.className = "dynamic-input";
        input.id = `input-${field}`;
        
        // Input turlarini aniqlash
        if(field.includes("id")) { input.placeholder = field.toUpperCase().replace('_', ' ') + " kiriting"; input.type = "number"; }
        else if(field.includes("email")) { input.placeholder = "Email manzilingiz"; input.type = "email"; }
        else if(field.includes("phone")) { input.placeholder = "Telefon raqam"; input.type = "tel"; }
        else { input.placeholder = field.replace('_', ' ').toUpperCase(); }
        
        container.appendChild(input);
    });

    document.getElementById('pubg-id-modal').style.display = 'flex';
}

async function confirmOrder() {
    if (!currentProduct) return;
    if (userBalance < currentProduct.price) return tg.showAlert("Mablag' yetarli emas!");

    const details = {};
    let hasEmpty = false;

    const fields = Array.isArray(currentProduct.fields) ? currentProduct.fields : JSON.parse(currentProduct.fields || "[]");
    fields.forEach(field => {
        const val = document.getElementById(`input-${field}`).value.trim();
        if (!val) hasEmpty = true;
        details[field] = val;
    });

    if (hasEmpty) return tg.showAlert("Iltimos, barcha ma'lumotlarni kiriting!");

    const btn = document.getElementById('confirm-order-btn');
    btn.disabled = true;
    btn.innerText = "Yuborilmoqda...";

    try {
        const res = await fetch(`${API_BASE_URL}/api/order`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: userTelegramId,
                label: currentProduct.label,
                price: currentProduct.price,
                details: details
            })
        });
        const result = await res.json();
        if (result.success) {
            tg.showPopup({
                title: "Muvaffaqiyatli!",
                message: "Buyurtmangiz qabul qilindi. Tez orada bajariladi!",
                buttons: [{type: "ok"}]
            });
            closeModal();
            fetchBalance(); // Balansni yangilash
        } else {
            tg.showAlert(result.message || "Xatolik yuz berdi");
        }
    } catch (e) {
        tg.showAlert("Server bilan aloqa uzildi!");
    } finally {
        btn.disabled = false;
        btn.innerText = "Sotib olish";
    }
}

// 6. BALANSNI TO'LDIRISH (TOPUP)
async function requestTopup() {
    const amount = document.getElementById('topup-amount').value;
    const btn = document.getElementById('send-topup-btn');

    if (!amount || amount < 1000) return tg.showAlert("Minimal summa 1000 UZS");
    if (!selectedFileBase64) return tg.showAlert("Iltimos, to'lov cheki (rasm) yuklang!");

    btn.disabled = true;
    btn.innerText = "Yuborilmoqda...";

    try {
        const res = await fetch(`${API_BASE_URL}/api/request-topup`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: userTelegramId,
                amount: amount,
                image: selectedFileBase64
            })
        });

        if (res.ok) {
            closeTopupModal();
            tg.showPopup({
                title: "Yuborildi!",
                message: "To'lov cheki adminga yuborildi. 1-15 daqiqa ichida hisobingiz to'ldiriladi.",
                buttons: [{type: "ok"}]
            });
        }
    } catch (e) {
        tg.showAlert("Server xatosi! Chek yuborilmadi.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Tasdiqlash uchun yuborish";
    }
}

// 7. YORDAMCHI FUNKSIYALAR
async function fetchBalance() {
    if (!userTelegramId) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/user?id=${userTelegramId}`);
        const data = await res.json();
        if (data && data.balance !== undefined) {
            userBalance = parseFloat(data.balance);
            updateUI('balance-display', formatMoney(userBalance) + ' UZS');
        }
    } catch (e) { console.error("Balans xatosi:", e); }
}

function updateUI(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function formatMoney(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function closeModal() {
    document.getElementById('pubg-id-modal').style.display = 'none';
    currentProduct = null;
}

function closeTopupModal() {
    document.getElementById('topup-modal').style.display = 'none';
}

function previewFile() {
    const file = document.getElementById('receipt-upload').files[0];
    const hint = document.getElementById('file-preview-name');
    if (file) {
        hint.innerText = "Tanlandi: " + file.name;
        const reader = new FileReader();
        reader.onload = (e) => { selectedFileBase64 = e.target.result; };
        reader.readAsDataURL(file);
    }
}

function copyCard(number) {
    navigator.clipboard.writeText(number);
    tg.HapticFeedback.notificationOccurred('success');
    tg.showAlert("Karta raqami nusxalandi!");
}

function copyReferralLink() {
    const copyText = document.getElementById("my-ref-link");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    tg.showAlert("Havola nusxalandi!");
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('section').forEach(el => {
        el.classList.remove('active-section');
        el.classList.add('hidden-section');
    });

    const activeNav = document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`);
    if (activeNav) activeNav.classList.add('active');
    
    const section = document.getElementById(`section-${tabName}`);
    if (section) {
        section.classList.remove('hidden-section');
        section.classList.add('active-section');
    }
    window.scrollTo(0, 0);
}

function createExplosionParticles() {
    const container = document.querySelector('.particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.classList.add('particle');
        container.appendChild(p);
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 100;
        p.style.setProperty('--x', Math.cos(angle) * dist + 'px');
        p.style.setProperty('--y', Math.sin(angle) * dist + 'px');
        setTimeout(() => p.classList.add('active'), 1500);
    }
}
