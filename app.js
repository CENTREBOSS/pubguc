// app.js

// 1. TELEGRAM WEBAPP INIT
const tg = window.Telegram.WebApp;
tg.expand(); // To'liq ekran qilish

// Rang sxemasini avtomatik sozlash (Light/Dark)
document.documentElement.style.setProperty('--tg-theme-bg', tg.themeParams.bg_color);

// 2. CONFIG
// MUHIM: Bu yerga Renderdagi URLingizni yozing (oxirida / yo'q)
const API_BASE_URL = window.location.origin; // Agar index.php bilan bir joyda tursa
const BOT_USERNAME = "TurboHamyonBot"; // O'Z BOTINGIZ USERNAME SINI YOZING (@ siz)

const products = [
    { id: 1, category: "PUBG", price: 12000, fields: ["player_id"], label: "60 UC" },
    { id: 10, category: "MLBB", price: 18000, fields: ["player_id", "server_id"], label: "86 Diamonds" },
    { id: 20, category: "Free Fire", price: 11000, fields: ["player_id"], label: "100 Diamonds" },
    { id: 30, category: "Steam", price: 65000, fields: ["account_name"], label: "5 USD Wallet" },
    { id: 40, category: "Razer Gold", price: 135000, fields: ["email"], label: "10 USD Code" }
];

// State
let cart = [];
let userBalance = 0;
let userTelegramId = null;

// 3. INTRO ANIMATION LOGIC
document.addEventListener('DOMContentLoaded', () => {
    createExplosionParticles();
    
    // 2 soniyadan keyin ilovani ochish
    setTimeout(() => {
        document.getElementById('intro-loader').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        initApp();
    }, 2200);
});

function createExplosionParticles() {
    const container = document.querySelector('.particles');
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.classList.add('particle');
        container.appendChild(p);
        
        // Tasodifiy yo'nalish
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 100;
        const x = Math.cos(angle) * dist + 'px';
        const y = Math.sin(angle) * dist + 'px';
        
        p.style.setProperty('--x', x);
        p.style.setProperty('--y', y);
        
        // Animatsiyani kechiktirish (sharcha kelganidan keyin)
        setTimeout(() => {
            p.classList.add('active');
        }, 1500);
    }
}

// 4. APP INITIALIZATION
function initApp() {
    // User ma'lumotlarini olish
    const user = tg.initDataUnsafe.user;
    
    if (user) {
        userTelegramId = user.id;
        document.getElementById('user-name').innerText = user.first_name;
        document.getElementById('user-username').innerText = user.username ? '@' + user.username : 'Username yo\'q';
        document.getElementById('user-id').innerText = user.id;
        if(user.photo_url) {
            document.getElementById('user-avatar').src = user.photo_url;
        }
        
        // Balansni Backenddan olish
        fetchBalance();
    } else {
        // Test rejimi (Brauzerda ochilganda)
        userTelegramId = "123456789"; // Fake ID
        document.getElementById('user-name').innerText = "Test User";
    }

// Referal linkni generatsiya qilish
    if (userTelegramId) {
        const refLink = `https://t.me/${BOT_USERNAME}?start=${userTelegramId}`;
        const inputEl = document.getElementById('my-ref-link');
        if(inputEl) inputEl.value = refLink;
    }
    
    renderShop(); // Do'konni yuklash
    // ...

}

// 5. FETCH DATA
async function fetchBalance() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/user?id=${userTelegramId}`);
        const data = await res.json();
        if (data && data.balance !== undefined) {
            userBalance = data.balance;
            document.getElementById('balance-display').innerText = formatMoney(userBalance) + ' UZS';
        }
    } catch (e) {
        console.error("Balans xatosi:", e);
    }
}

// 6. RENDER SHOP
function renderShop() {
    const container = document.getElementById('products-container');
    container.innerHTML = '';
    
    products.forEach(prod => {
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
            <div class="uc-icon"><i class="fa-solid fa-gem"></i></div>
            <h3>${prod.label}</h3>
            <span class="price-tag">${formatMoney(prod.price)} UZS</span>
            <button class="buy-btn" onclick="addToCart(${prod.id})">
                <i class="fa-solid fa-cart-plus"></i> Savatga
            </button>
        `;
        container.appendChild(div);
    });
}

// 7. CART LOGIC
function addToCart(id) {
    const product = products.find(p => p.id === id);
    cart.push(product);
    updateCartUI();
    
    // Kichik animatsiya (tugmaga)
    tg.HapticFeedback.notificationOccurred('success'); // Telefon vibratsiyasi
    showToast("Savatga qo'shildi!");
}

function updateCartUI() {
    const badge = document.getElementById('cart-badge');
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    
    // Badge update
    if (cart.length > 0) {
        badge.classList.remove('hidden');
        badge.innerText = cart.length;
    } else {
        badge.classList.add('hidden');
    }

    // Render items
    container.innerHTML = '';
    let total = 0;

    if(cart.length === 0) {
        container.innerHTML = '<div class="empty-state">Savat bo\'sh</div>';
    } else {
        cart.forEach((item, index) => {
            total += item.price;
            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;";
            div.innerHTML = `
                <span>${item.label}</span>
                <span>${formatMoney(item.price)}</span>
                <i class="fa-solid fa-trash" style="color:red; cursor:pointer;" onclick="removeFromCart(${index})"></i>
            `;
            container.appendChild(div);
        });
    }
    
    totalEl.innerText = formatMoney(total);
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function clearCart() {
    cart = [];
    updateCartUI();
}

// 8. NAVIGATION
function switchTab(tabName) {
    // Remove active class from navs
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Hide all sections
    document.querySelectorAll('section').forEach(el => {
        el.classList.remove('active-section');
        el.classList.add('hidden-section');
    });

    // Activate current
    document.querySelector(`.nav-item[onclick="switchTab('${tabName}')"]`).classList.add('active');
    
    const section = document.getElementById(`section-${tabName}`);
    section.classList.remove('hidden-section');
    section.classList.add('active-section');

    // Scroll to top
    window.scrollTo(0, 0);
}

// 9. CHECKOUT & PAYMENT
function checkout() {
    if (cart.length === 0) return showToast("Savat bo'sh!");
    
    let total = cart.reduce((sum, item) => sum + item.price, 0);
    
    if (userBalance < total) {
        tg.showPopup({
            title: "Mablag' yetarli emas",
            message: "Iltimos, hisobingizni to'ldiring.",
            buttons: [{type: "ok"}]
        });
        return;
    }

    // PUBG ID so'rash
    document.getElementById('pubg-id-modal').style.display = 'flex';
}

function closePubgModal() {
    document.getElementById('pubg-id-modal').style.display = 'none';
}

async function processPayment() {
    const pubgId = document.getElementById('pubg-game-id').value;
    if (!pubgId) return showToast("ID kiritilmadi!");

    // Buttonni bloklash
    const btn = document.querySelector('#pubg-id-modal button');
    btn.disabled = true;
    btn.innerText = "Bajarilmoqda...";

    // Har bir tovar uchun alohida so'rov (yoki hammasini bitta qilsa bo'ladi)
    // Bu yerda soddalik uchun loop qilamiz
    for (const item of cart) {
        await fetch(`${API_BASE_URL}/api/buy-uc`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: userTelegramId,
                uc_amount: item.uc,
                price: item.price,
                pubg_id: pubgId
            })
        });
    }

    // Reset
    cart = [];
    updateCartUI();
    closePubgModal();
    btn.disabled = false;
    btn.innerText = "To'lash";
    
    fetchBalance(); // Balansni yangilash
    
    tg.showPopup({
        title: "Muvaffaqiyatli!",
        message: "Buyurtmangiz qabul qilindi. 1 Daqiqa kuting. Buyurtma yo'lda ",
        buttons: [{type: "ok"}]
    });
    
    switchTab('profile'); // Profilga o'tib tarixni ko'rish (kelajakda)
}

// 10. TOPUP (Hisob to'ldirish)
function openTopupModal() {
    document.getElementById('topup-modal').style.display = 'flex';
}
function closeTopupModal() {
    document.getElementById('topup-modal').style.display = 'none';
}

async function requestTopup() {
    const amount = document.getElementById('topup-amount').value;
    if (!amount || amount < 1000) return showToast("Minimal summa 1000 UZS");

    await fetch(`${API_BASE_URL}/api/request-topup`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            telegram_id: userTelegramId,
            amount: amount
        })
    });

    closeTopupModal();
    tg.showPopup({
        title: "So'rov yuborildi",
        message: "Tasdiqlanishini kuting.",
        buttons: [{type: "ok"}]
    });
}

// UTILS
function formatMoney(amount) {
    return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function showToast(msg) {
    // Oddiy alert o'rniga chiroyli toast qilish mumkin
    // Hozircha telegram popup ishlatamiz
    tg.showAlert(msg);
}
let selectedFileBase64 = null;

function previewFile() {
    const file = document.getElementById('receipt-upload').files[0];
    const hint = document.getElementById('file-preview-name');
    
    if (file) {
        hint.innerText = "Tanlandi: " + file.name;
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedFileBase64 = e.target.result; // Base64 formatida saqlaydi
        };
        reader.readAsDataURL(file);
    }
}

function copyCard(number) {
    navigator.clipboard.writeText(number);
    tg.showScanQrPopup({ text: "Karta raqami nusxalandi!" }); // Kichik vizual effekt
    setTimeout(() => tg.closeScanQrPopup(), 1000);
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
                image: selectedFileBase64 // Rasmni yuboramiz
            })
        });

        if (res.ok) {
            closeTopupModal();
            tg.showPopup({
                title: "Yuborildi!",
                message: "Tasdiqlangach hisobingiz to'ldiriladi. 1-5 daqiqa kuting va sahifani yangilang yoki qayta oching.",
                buttons: [{type: "ok"}]
            });
        }
    } catch (e) {
        tg.showAlert("Xatolik yuz berdi!");
    } finally {
        btn.disabled = false;
        btn.innerText = "Tasdiqlash uchun yuborish";
    }

}

function copyReferralLink() {
    const copyText = document.getElementById("my-ref-link");
    
    // Matnni tanlash va nusxalash
    copyText.select();
    copyText.setSelectionRange(0, 99999); // Mobil qurilmalar uchun
    
    navigator.clipboard.writeText(copyText.value).then(() => {
        // Muvaffaqiyatli
        tg.showScanQrPopup({ text: "Havola nusxalandi!" });
        setTimeout(() => tg.closeScanQrPopup(), 800);
    }).catch(err => {
        // Agar xatolik bo'lsa
        showToast("Nusxalandi!");
    });
}













