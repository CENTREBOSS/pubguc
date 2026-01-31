<?php
// 1. FRONTEND ROUTING
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($uri === '/' || $uri === '/index.html') {
    header('Content-Type: text/html');
    if(file_exists('index.html')) readfile('index.html');
    exit;
}

if ($uri === '/style.css') {
    header('Content-Type: text/css');
    if(file_exists('style.css')) readfile('style.css');
    exit;
}

if ($uri === '/app.js') {
    header('Content-Type: application/javascript');
    if(file_exists('app.js')) readfile('app.js');
    exit;
}

// 2. BACKEND LOGIC
ini_set('display_errors', 0);
error_reporting(E_ALL);

// ---------------- SOZLAMALAR ----------------
define('BOT_TOKEN', getenv('BOT_TOKEN') ?: 'SIZNING_BOT_TOKENINGIZ');
define('ADMIN_ID', getenv('ADMIN_ID') ?: 'SIZNING_IDINGIZ'); 
define('WEBAPP_URL', getenv('WEBAPP_URL') ?: 'https://sizning-url.onrender.com');

// Bazaga ulanish
try {
    $pdo = new PDO('sqlite:database.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Foydalanuvchilar jadvali
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        telegram_id TEXT UNIQUE,
        first_name TEXT,
        username TEXT,
        balance REAL DEFAULT 0,
        is_blocked INTEGER DEFAULT 0, 
        block_reason TEXT,
        inviter_id TEXT DEFAULT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // Mahsulotlar jadvali (YANGI)
    $pdo->exec("CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        label TEXT,
        price REAL,
        description TEXT,
        fields TEXT -- JSON string: ["player_id", "server_id"]
    )");

    // Buyurtmalar jadvali
    $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        details TEXT, -- JSON formatida barcha inputlar
        product_label TEXT,
        price REAL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    // To'lovlar jadvali
    $pdo->exec("CREATE TABLE IF NOT EXISTS topups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        amount REAL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
} catch (PDOException $e) {
    die("DB Error: " . $e->getMessage());
}

// ---------------- ROUTING (API) ----------------
$method = $_SERVER['REQUEST_METHOD'];

// Webhook handling
if ($method === 'POST' && $uri === '/webhook') {
    handleTelegramUpdate();
    exit;
}

// API: Foydalanuvchi ma'lumotlarini olish
if ($method === 'GET' && strpos($uri, '/api/user') === 0) {
    header('Content-Type: application/json');
    $tg_id = $_GET['id'] ?? 0;
    $stmt = $pdo->prepare("SELECT * FROM users WHERE telegram_id = ?");
    $stmt->execute([$tg_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    echo json_encode($user ?: ['error' => 'Not found']);
    exit;
}

// API: Mahsulotlar ro'yxatini olish (YANGI)
if ($method === 'GET' && $uri === '/api/products') {
    header('Content-Type: application/json');
    $stmt = $pdo->query("SELECT * FROM products ORDER BY category ASC");
    $prods = $stmt->fetchAll(PDO::FETCH_ASSOC);
    // JSON fieldsni arrayga o'tkazish
    foreach($prods as &$p) $p['fields'] = json_decode($p['fields']);
    echo json_encode($prods);
    exit;
}

// API: Buyurtma berish
if ($method === 'POST' && $uri === '/api/order') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);
    handleOrder($input);
    exit;
}

// API: To'lov so'rovi
if ($method === 'POST' && $uri === '/api/request-topup') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);
    handleTopupRequest($input);
    exit;
}

// ---------------- TELEGRAM BOT MANTIQI ----------------

function handleTelegramUpdate() {
    global $pdo;
    $update = json_decode(file_get_contents('php://input'), true);

    if (isset($update['message'])) {
        $chat_id = $update['message']['chat']['id'];
        $text = $update['message']['text'] ?? '';
        $user_from = $update['message']['from'];

        // Foydalanuvchini bazaga qo'shish/yangilash
        saveUser($user_from, $text);

        // ADMIN PANEL BUYRUQLARI
        if ($chat_id == ADMIN_ID) {
            if ($text == "/admin" || $text == "/panel") {
                $kb = ['inline_keyboard' => [
                    [['text' => "➕ Mahsulot qo'shish", 'callback_data' => 'admin_add_prod']],
                    [['text' => "📦 Mahsulotlar ro'yxati", 'callback_data' => 'admin_list_prods']],
                    [['text' => "📊 Statistika", 'callback_data' => 'admin_stats']]
                ]];
                sendMessage($chat_id, "<b>Boshqaruv paneli:</b>", $kb);
                return;
            }

            // Oddiy xabar yuborish (Sizning kodingizdan)
            if (strpos($text, "Xabar: ") === 0) {
                $msg = str_replace("Xabar: ", "", $text);
                $users = $pdo->query("SELECT telegram_id FROM users")->fetchAll(PDO::FETCH_COLUMN);
                foreach ($users as $u_id) sendMessage($u_id, "🔔 <b>Xabar:</b>\n\n" . $msg);
                sendMessage(ADMIN_ID, "✅ Barchaga yuborildi.");
                return;
            }

            // Mahsulot qo'shish formati: +P PUBG|60 UC|12000|Tavsif|player_id
            if (strpos($text, "+P ") === 0) {
                $data = explode('|', str_replace("+P ", "", $text));
                if(count($data) >= 5) {
                    $fields = json_encode(explode(',', $data[4]));
                    $stmt = $pdo->prepare("INSERT INTO products (category, label, price, description, fields) VALUES (?,?,?,?,?)");
                    $stmt->execute([$data[0], $data[1], $data[2], $data[3], $fields]);
                    sendMessage(ADMIN_ID, "✅ Mahsulot qo'shildi!");
                } else {
                    sendMessage(ADMIN_ID, "❌ Xato! Format: <code>+P Kategoriya|Nomi|Narxi|Tavsif|field1,field2</code>");
                }
                return;
            }
        }

        // START
        if (strpos($text, '/start') === 0) {
            $kb = ['inline_keyboard' => [
                [['text' => "Do'konni ochish 🛒", 'web_app' => ['url' => WEBAPP_URL]]],
                [['text' => "Admin bilan aloqa 👨‍💻", 'url' => 'https://t.me/SultanovSardorbekSheraliyevich']]
            ]];
            sendMessage($chat_id, "Xush kelibsiz! Do'konimizdan foydalanish uchun pastdagi tugmani bosing.", $kb);
        }
    }

    // Callback so'rovlari
    if (isset($update['callback_query'])) {
        handleCallbacks($update['callback_query']);
    }
}

function handleCallbacks($cq) {
    global $pdo;
    $data = $cq['data'];
    $chat_id = $cq['message']['chat']['id'];
    $mid = $cq['message']['message_id'];

    if ($data == 'admin_list_prods') {
        $prods = $pdo->query("SELECT * FROM products LIMIT 20")->fetchAll();
        $txt = "📦 <b>Mahsulotlar:</b>\n\n";
        $kb = ['inline_keyboard' => []];
        foreach($prods as $p) {
            $txt .= "ID: {$p['id']} | {$p['label']} - {$p['price']} UZS\n";
            $kb['inline_keyboard'][] = [['text' => "❌ {$p['label']} o'chirish", 'callback_data' => "del_prod_{$p['id']}"]];
        }
        $kb['inline_keyboard'][] = [['text' => "🔙 Orqaga", 'callback_data' => 'admin_back']];
        editMessageText($chat_id, $mid, $txt, $kb);
    }

    if (strpos($data, 'del_prod_') === 0) {
        $id = str_replace('del_prod_', '', $data);
        $pdo->prepare("DELETE FROM products WHERE id = ?")->execute([$id]);
        sendMessage($chat_id, "✅ Mahsulot o'chirildi.");
    }

    // To'lov va buyurtma statuslarini o'zgartirish (Sizning kodingizdagi processTopup va changeOrderStatus shu yerda davom etadi)
    if (strpos($data, 'approve_topup_') === 0) processTopup(str_replace('approve_topup_', '', $data), 'approved', $chat_id, $mid);
    if (strpos($data, 'reject_topup_') === 0) processTopup(str_replace('reject_topup_', '', $data), 'rejected', $chat_id, $mid);
    if (strpos($data, 'order_status_') === 0) {
        $p = explode('_', $data);
        changeOrderStatus($p[2], $p[3], $chat_id, $mid);
    }
}

// ---------------- YORDAMCHI FUNKSIYALAR ----------------

function saveUser($from, $text) {
    global $pdo;
    $chat_id = $from['id'];
    $first_name = $from['first_name'] ?? 'User';
    $username = $from['username'] ?? '';
    
    $stmt = $pdo->prepare("SELECT id FROM users WHERE telegram_id = ?");
    $stmt->execute([$chat_id]);
    if (!$stmt->fetch()) {
        $inviter = null;
        if (strpos($text, '/start ') === 0) {
            $ref = str_replace('/start ', '', $text);
            if (is_numeric($ref) && $ref != $chat_id) $inviter = $ref;
        }
        $pdo->prepare("INSERT INTO users (telegram_id, first_name, username, inviter_id) VALUES (?, ?, ?, ?)")
            ->execute([$chat_id, $first_name, $username, $inviter]);
        
        if ($inviter) {
            $pdo->prepare("UPDATE users SET balance = balance + 200 WHERE telegram_id = ?")->execute([$inviter]);
            sendMessage($inviter, "👏 Yangi do'st taklif qildingiz! +200 UZS bonus.");
        }
    }
}

// Buyurtma berish mantiqi (Yangilangan: Details JSON sifatida saqlanadi)
function handleOrder($data) {
    global $pdo;
    $user_id = $data['telegram_id'];
    $price = $data['price'];
    $label = $data['label'];
    $details = json_encode($data['details']);

    $stmt = $pdo->prepare("SELECT balance FROM users WHERE telegram_id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    if (!$user || $user['balance'] < $price) {
        echo json_encode(['success' => false, 'message' => "Mablag' yetarli emas"]);
        return;
    }

    $pdo->prepare("UPDATE users SET balance = balance - ? WHERE telegram_id = ?")->execute([$price, $user_id]);
    $stmt = $pdo->prepare("INSERT INTO orders (user_id, details, product_label, price) VALUES (?, ?, ?, ?)");
    $stmt->execute([$user_id, $details, $label, $price]);
    $order_id = $pdo->lastInsertId();

    $info = "📦 <b>$label</b>\n";
    foreach ($data['details'] as $k => $v) $info .= "🔹 " . ucfirst($k) . ": $v\n";

    sendMessage($user_id, "⏳ Buyurtmangiz qabul qilindi!\n#$order_id\n$info");
    
    $kb = ['inline_keyboard' => [
        [['text' => "⏳ Jarayonda", 'callback_data' => "order_status_{$order_id}_processing"],
         ['text' => "✅ Bajarildi", 'callback_data' => "order_status_{$order_id}_completed"]],
        [['text' => "❌ Bekor qilish", 'callback_data' => "order_status_{$order_id}_cancelled"]]
    ]];
    
    sendMessage(ADMIN_ID, "🛒 <b>YANGI BUYURTMA #$order_id</b>\nUser: $user_id\n$info\nNarxi: $price UZS", $kb);
    echo json_encode(['success' => true]);
}

// To'lov so'rovi (Rasmli)
function handleTopupRequest($data) {
    global $pdo;
    $user_id = $data['telegram_id'];
    $amount = $data['amount'];
    $image_data = base64_decode(explode(";base64,", $data['image'])[1]);
    
    $pdo->prepare("INSERT INTO topups (user_id, amount) VALUES (?, ?)")->execute([$user_id, $amount]);
    $topup_id = $pdo->lastInsertId();
    
    $f = "tmp_receipt_$topup_id.png";
    file_put_contents($f, $image_data);

    $kb = ['inline_keyboard' => [[
        ['text' => "✅ Tasdiqlash", 'callback_data' => "approve_topup_$topup_id"],
        ['text' => "❌ Rad etish", 'callback_data' => "reject_topup_$topup_id"]
    ]]];

    $post = ['chat_id' => ADMIN_ID, 'photo' => new CURLFile(realpath($f)), 'caption' => "💰 To'lov so'rovi!\nUser: $user_id\nSumma: $amount UZS", 'reply_markup' => json_encode($kb)];
    request('sendPhoto', $post);
    unlink($f);

    echo json_encode(['success' => true]);
}

// Qolgan yordamchi funksiyalar (sendMessage, request va h.k. sizning kodingizdagidek qoladi)
function processTopup($id, $action, $admin_id, $msg_id) {
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM topups WHERE id = ?");
    $stmt->execute([$id]);
    $t = $stmt->fetch();
    if ($t && $t['status'] == 'pending') {
        if ($action == 'approved') {
            $pdo->prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?")->execute([$t['amount'], $t['user_id']]);
            $pdo->prepare("UPDATE topups SET status = 'approved' WHERE id = ?")->execute([$id]);
            sendMessage($t['user_id'], "✅ Hisobingiz {$t['amount']} UZS ga to'ldirildi!");
            editMessageText($admin_id, $msg_id, "✅ Tasdiqlandi (ID: $id)");
        } else {
            $pdo->prepare("UPDATE topups SET status = 'rejected' WHERE id = ?")->execute([$id]);
            sendMessage($t['user_id'], "❌ To'lov rad etildi.");
            editMessageText($admin_id, $msg_id, "❌ Rad etildi (ID: $id)");
        }
    }
}

function changeOrderStatus($id, $status, $admin_id, $msg_id) {
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM orders WHERE id = ?");
    $stmt->execute([$id]);
    $o = $stmt->fetch();
    if (!$o) return;

    if ($status == 'cancelled' && $o['status'] != 'cancelled') {
        $pdo->prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?")->execute([$o['price'], $o['user_id']]);
        sendMessage($o['user_id'], "❌ Buyurtma #$id bekor qilindi, pul qaytarildi.");
    } elseif ($status == 'completed') {
        sendMessage($o['user_id'], "✅ Buyurtma #$id bajarildi!");
    }
    $pdo->prepare("UPDATE orders SET status = ? WHERE id = ?")->execute([$status, $id]);
    editMessageText($admin_id, $msg_id, "Статус: $status (ID: $id)");
}

function sendMessage($chat_id, $text, $kb = null) {
    $d = ['chat_id' => $chat_id, 'text' => $text, 'parse_mode' => 'HTML'];
    if ($kb) $d['reply_markup'] = json_encode($kb);
    return request('sendMessage', $d);
}

function editMessageText($chat_id, $mid, $text, $kb = null) {
    $d = ['chat_id' => $chat_id, 'message_id' => $mid, 'text' => $text, 'parse_mode' => 'HTML'];
    if ($kb) $d['reply_markup'] = json_encode($kb);
    return request('editMessageText', $d);
}

function request($m, $d) {
    $ch = curl_init("https://api.telegram.org/bot" . BOT_TOKEN . "/" . $m);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $d);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $r = curl_exec($ch);
    curl_close($ch);
    return $r;
}

echo "TurboHamyon Engine v2.0 is running...";
