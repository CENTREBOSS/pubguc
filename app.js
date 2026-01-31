// app.js - To'liq va tozalangan versiya

// 1. TELEGRAM WEBAPP INIT
const tg = window.Telegram.WebApp;
tg.expand();

// Rang sxemasini avtomatik sozlash
document.documentElement.style.setProperty('--tg-theme-bg', tg.themeParams.bg_color);

// 2. CONFIG
const API_BASE_URL = window.location.origin;
const BOT_USERNAME = "TurboHamyonBot"; // Username @ siz bo'lishi kerak

const products = [
    { id: 1, category: "PUBG", price: 12000, fields: ["player_id"], label: "60 UC" },
    { id: 10, category: "MLBB", price: 18000, fields: ["player_id", "server_id"], label: "86 Diamonds" },
    { id: 20, category: "Free Fire", price: 11000, fields: ["player_id"], label: "100 Diamonds" },
    { id: 30, category: "Steam", price: 65000, fields: ["account_name"], label: "5 USD Wallet" },
    { id: 40, category: "Razer Gold", price: 135000, fields: ["email"], label: "10 USD Code" }
];

// State
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

function initApp() {
    const user = tg.initDataUnsafe.user;
    
    if (user) {
        userTelegramId = user.id;
        const nameEl = document.getElementById('user-name');
        const usernameEl = document.getElementById('user-username');
        const idEl = document.getElementById('user-id');
        const avatarEl = document.getElementById('user-avatar');

        if (nameEl) nameEl.innerText = user.first_name;
        if (usernameEl) usernameEl.innerText = user.username ? '@' + user.username : 'Username yo\'q';
        if (idEl) idEl.innerText = user.id;
        if (avatarEl && user.photo_url) avatarEl.src = user.photo_url;
        
        fetchBalance();
    } else {
        userTelegramId = "123456789"; // Test uchun
        console.log("WebApp Telegram ichida ochilmadi");
    }

    // Referal link
    if (userTelegramId) {
        const refLink = `https://t.me/${BOT_USERNAME}?start=${userTelegramId}`;
        const inputEl = document.getElementById('my-ref-link');
        if (inputEl) inputEl.value = refLink;
    }
    
    renderShop();
}

// 4. SHOP & MODAL LOGIC
function renderShop() {
    const container = document.getElementById('products-container');
    if (!container) return;
    container.innerHTML = '';
    
    products.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div class="uc-icon"><i class="fa-solid fa-gem"></i></div>
            <h3>${prod.label}</h3>
            <span class="price-tag">${formatMoney(prod.price)} UZS</span>
            <button class="buy-btn" onclick="openOrderModal(${prod.id})">
                <i class="fa-solid fa-cart-plus"></i> Sotib olish
            </button>
        `;
        container.appendChild(div);
    });
}

function openOrderModal(productId) {
    currentProduct = products.find(p => p.id === productId);
    const container = document.getElementById('dynamic-fields-container');
    const title = document.getElementById('modal-title');
    
    if (!container || !currentProduct) return;

    container.innerHTML = ''; 
    title.innerText = currentProduct.category + " uchun ma'lumotlar";

    currentProduct.fields.forEach(field => {
        const input = document.createElement('input');
        input.className = "dynamic-input";
        input.id = `input-${field}`;
        
        if(field === "player_id") input.placeholder = "Player ID kiriting";
        else if(field === "server_id") { input.placeholder = "Server ID kiriting"; input.type = "number"; }
        else if(field === "account_name") input.placeholder = "Login (Akkaunt nomi)";
        else if(field === "email") { input.placeholder = "Email manzilingiz"; input.type = "email"; }
        else input.placeholder = field.replace('_', ' ').toUpperCase();
        
        container.appendChild(input);
    });

    document.getElementById('pubg-id-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('pubg-id-modal').style.display = 'none';
    currentProduct = null;
}

async function confirmOrder() {
    if (!currentProduct) return;
    if (userBalance < currentProduct.price) return tg.showAlert("Mablag' yetarli emas!");

    const details = {};
    let empty = false;

    currentProduct.fields.forEach(field => {
        const val = document.getElementById(`input-${field}`).value.trim();
        if (!val) empty = true;
        details[field] = val;
    });

    if (empty) return tg.showAlert("Hamma maydonni to'ldiring!");

    const btn = document.getElementById('confirm-order-btn');
    btn.disabled = true;
    btn.innerText = "Yuborilmoqda...";

    try {
        const res = await fetch(`${API_BASE_URL}/api/order`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: userTelegramId,
                product_id: currentProduct.id,
                label: currentProduct.label,
                price: currentProduct.price,
                details: details
            })
        });
        const result = await res.json();
        if (result.success) {
            tg.showPopup({
                title: "Muvaffaqiyatli!",
                message: "Buyurtmangiz qabul qilindi!",
                buttons: [{type: "ok"}]
            });
            closeModal();
            fetchBalance(); 
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

// 5. TOPUP LOGIC
function openTopupModal() {
    document.getElementById('topup-modal').style.display = 'flex';
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
        reader.onload = function(e) {
            selectedFileBase64 = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

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
                message: "Tasdiqlangach hisobingiz to'ldiriladi (1-5 daqiqa).",
                buttons: [{type: "ok"}]
            });
        } else {
            tg.showAlert("Xatolik: So'rov yuborilmadi");
        }
    } catch (e) {
        tg.showAlert("Server xatosi!");
    } finally {
        btn.disabled = false;
        btn.innerText = "Tasdiqlash uchun yuborish";
    }
}

// 6. NAVIGATION & UTILS
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

async function fetchBalance() {
    if (!userTelegramId) return;
    
    try {
        console.log("Balans so'ralmoqda id:", userTelegramId);
        const res = await fetch(`${API_BASE_URL}/api/user?id=${userTelegramId}`);
        const data = await res.json();
        
        console.log("Serverdan kelgan javob:", data);
        
        if (data && data.balance !== undefined) {
            userBalance = parseFloat(data.balance);
            const balEl = document.getElementById('balance-display');
            if (balEl) {
                balEl.innerText = formatMoney(userBalance) + ' UZS';
            }
        }
    } catch (e) {
        console.error("Balansni yuklashda xatolik:", e);
    }
}

function formatMoney(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function copyCard(number) {
    navigator.clipboard.writeText(number);
    tg.HapticFeedback.notificationOccurred('success');
    tg.showAlert("Karta raqami nusxalandi!");
}

function copyReferralLink() {
    const copyText = document.getElementById("my-ref-link");
    copyText.select();
    navigator.clipboard.writeText(copyText.value).then(() => {
        tg.showAlert("Havola nusxalandi!");
    });
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

