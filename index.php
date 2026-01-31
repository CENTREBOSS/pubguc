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
ini_set('display_errors', 0); // Productionda 0 bo'lishi kerak
error_reporting(E_ALL);

// ---------------- SOZLAMALAR ----------------
define('BOT_TOKEN', getenv('BOT_TOKEN') ?: 'SIZNING_BOT_TOKENINGIZ');
define('ADMIN_ID', getenv('ADMIN_ID') ?: 'SIZNING_IDINGIZ'); 
define('WEBAPP_URL', getenv('WEBAPP_URL') ?: 'https://sizning-url.onrender.com');

// Bazaga ulanish
try {
    $pdo = new PDO('sqlite:database.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Jadvallarni yaratish
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        pubg_id TEXT,
        uc_amount TEXT,
        price REAL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

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

// ---------------- ROUTING ----------------
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST' && $uri === '/webhook') {
    handleTelegramUpdate();
    exit;
}

if ($method === 'GET' && strpos($uri, '/api/user') === 0) {
    header('Content-Type: application/json');
    header("Access-Control-Allow-Origin: *");
    $tg_id = $_GET['id'] ?? 0;
    $stmt = $pdo->prepare("SELECT * FROM users WHERE telegram_id = ?");
    $stmt->execute([$tg_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    echo json_encode($user ?: ['telegram_id' => $tg_id, 'balance' => 0, 'error' => 'User not found']);
    exit;
}

if ($method === 'POST' && $uri === '/api/order') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);
    handleOrder($input);
    exit;
}

if ($method === 'POST' && $uri === '/api/request-topup') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);
    handleTopupRequest($input);
    exit;
}

// ---------------- FUNKSIYALAR ----------------

function handleTelegramUpdate() {
    global $pdo;
    $update = json_decode(file_get_contents('php://input'), true);

    if (isset($update['message'])) {
        $chat_id = $update['message']['chat']['id'];
        $text = $update['message']['text'] ?? '';
        $first_name = $update['message']['from']['first_name'] ?? 'User';
        $username = $update['message']['from']['username'] ?? '';

        // Blokni tekshirish
        $check = $pdo->prepare("SELECT is_blocked, block_reason FROM users WHERE telegram_id = ?");
        $check->execute([$chat_id]);
        $user_status = $check->fetch();

        if ($user_status && $user_status['is_blocked'] == 1) {
            sendMessage($chat_id, "❌ Siz botdan chetlatilgansiz!\n🛑 Sabab: " . $user_status['block_reason']);
            return;
        }

        // Start va Referal
        if (strpos($text, '/start') === 0) {
            $parts = explode(' ', $text);
            $inviter_id = (isset($parts[1]) && is_numeric($parts[1]) && $parts[1] != $chat_id) ? $parts[1] : null;

            $stmt = $pdo->prepare("SELECT id FROM users WHERE telegram_id = ?");
            $stmt->execute([$chat_id]);
            if (!$stmt->fetch()) {
                $insert = $pdo->prepare("INSERT INTO users (telegram_id, first_name, username, inviter_id) VALUES (?, ?, ?, ?)");
                $insert->execute([$chat_id, $first_name, $username, $inviter_id]);

                if ($inviter_id) {
                    $bonus = 200;
                    $pdo->prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?")->execute([$bonus, $inviter_id]);
                    sendMessage($inviter_id, "👏 Yangi do'stingiz qo'shildi! Balansingizga $bonus UZS bonus berildi.");
                }

                $count = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
                sendMessage(ADMIN_ID, "👋 Yangi User: $first_name\nID: $chat_id\nJami: $count");
            }

            $keyboard = ['inline_keyboard' => [
                [['text' => "Do'kon 🛒", 'web_app' => ['url' => WEBAPP_URL]]],
                [['text' => "Kanal 🔔", 'url' => 'https://t.me/TurboHamyon']],
                [['text' => "Admin 👨‍💻", 'url' => 'https://t.me/SultanovSardorbekSheraliyevich']]
            ]];
            if ($chat_id == ADMIN_ID) $keyboard['inline_keyboard'][] = [['text' => "Admin Panel ⚙️", 'callback_data' => 'admin_help']];
            
            sendMessage($chat_id, "Salom $first_name! Kerakli bo'limni tanlang:", $keyboard);
        }

        // Admin Buyruqlari
        if ($chat_id == ADMIN_ID) {
            if (strpos($text, "Xabar: ") === 0) {
                $msg = str_replace("Xabar: ", "", $text);
                $users = $pdo->query("SELECT telegram_id FROM users")->fetchAll(PDO::FETCH_COLUMN);
                foreach ($users as $u_id) sendMessage($u_id, $msg);
                sendMessage(ADMIN_ID, "✅ Yuborildi.");
            }
            if (preg_match("/^Balans: (\d+) (-?\d+)/", $text, $matches)) {
                $pdo->prepare("UPDATE users SET balance = balance + ? WHERE telegram_id = ?")->execute([$matches[2], $matches[1]]);
                sendMessage(ADMIN_ID, "✅ Balans yangilandi.");
                sendMessage($matches[1], "💰 Hisobingizda " . $matches[2] . " UZS o'zgarish bo'ldi.");
            }
        }
    }

    if (isset($update['callback_query'])) {
        $cq = $update['callback_query'];
        $data = $cq['data'];
        $chat_id = $cq['message']['chat']['id'];
        $msg_id = $cq['message']['message_id'];

        if (strpos($data, 'approve_topup_') === 0) {
            processTopup(str_replace('approve_topup_', '', $data), 'approved', $chat_id, $msg_id);
        } elseif (strpos($data, 'reject_topup_') === 0) {
            processTopup(str_replace('reject_topup_', '', $data), 'rejected', $chat_id, $msg_id);
        } elseif (strpos($data, 'order_status_') === 0) {
            $p = explode('_', $data);
            changeOrderStatus($p[2], $p[3], $chat_id, $msg_id);
        }
    }
}



function handleTopupRequest($data) {
    global $pdo;
    $user_id = $data['telegram_id'];
    $amount = $data['amount'];
    $image_data = $data['image'];

    $stmt = $pdo->prepare("INSERT INTO topups (user_id, amount) VALUES (?, ?)");
    $stmt->execute([$user_id, $amount]);
    $topup_id = $pdo->lastInsertId();

    $image_base64 = base64_decode(explode(";base64,", $image_data)[1]);
    $file_path = "receipt_$topup_id.png";
    file_put_contents($file_path, $image_base64);

    $keyboard = ['inline_keyboard' => [[
        ['text' => "✅ Tasdiqlash", 'callback_data' => "approve_topup_$topup_id"],
        ['text' => "❌ Rad etish", 'callback_data' => "reject_topup_$topup_id"]
    ]]];

    $post_fields = [
        'chat_id' => ADMIN_ID,
        'photo' => new CURLFile(realpath($file_path)),
        'caption' => "💰 To'lov so'rovi!\nUser: $user_id\nSumma: $amount UZS",
        'reply_markup' => json_encode($keyboard)
    ];

    $ch = curl_init("https://api.telegram.org/bot" . BOT_TOKEN . "/sendPhoto");
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $post_fields);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_exec($ch);
    curl_close($ch);
    unlink($file_path);

    echo json_encode(['success' => true]);
}

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

function handleOrder($data) {
    global $pdo;
    $user_id = $data['telegram_id'];
    $label = $data['label'];
    $price = $data['price'];
    $details = $data['details'];

    $stmt = $pdo->prepare("SELECT balance FROM users WHERE telegram_id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();

    if (!$user || $user['balance'] < $price) {
        echo json_encode(['success' => false, 'message' => "Mablag' yetarli emas"]);
        return;
    }

    $pdo->prepare("UPDATE users SET balance = balance - ? WHERE telegram_id = ?")->execute([$price, $user_id]);
    $details_str = json_encode($details);
    
    $stmt = $pdo->prepare("INSERT INTO orders (user_id, pubg_id, uc_amount, price) VALUES (?, ?, ?, ?)");
    $stmt->execute([$user_id, $details_str, $label, $price]);
    $order_id = $pdo->lastInsertId();

    $info = "";
    foreach ($details as $k => $v) $info .= "🔹 $k: $v\n";

    sendMessage($user_id, "⏳ Buyurtma qabul qilindi!\n📦 $label\n$info");
    
    $kb = ['inline_keyboard' => [
        [['text' => "⏳ Jarayonda", 'callback_data' => "order_status_{$order_id}_processing"],
         ['text' => "✅ Bajarildi", 'callback_data' => "order_status_{$order_id}_completed"]],
        [['text' => "❌ Bekor qilish", 'callback_data' => "order_status_{$order_id}_cancelled"]]
    ]];
    
    sendMessage(ADMIN_ID, "🛒 YANGI BUYURTMA #$order_id\nUser: $user_id\n$info\nSumma: $price", $kb);
    echo json_encode(['success' => true]);
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

function editMessageText($chat_id, $mid, $text) {
    return request('editMessageText', ['chat_id' => $chat_id, 'message_id' => $mid, 'text' => $text]);
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

echo "Backend ishlamoqda: " . date('H:i:s');
