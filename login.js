const axios = require('axios');
const { chromium } = require('playwright');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

// 解析多个账号，支持逗号或分号分隔
const accountList = accounts.split(/[,;]/).map(account => {
  const [user, pass] = account.split(":").map(s => s.trim());
  return { user, pass };
}).filter(acc => acc.user && acc.pass);

if (accountList.length === 0) {
  console.log('❌ 账号格式错误，应为 username1:password1,username2:password2');
  process.exit(1);
}

async function sendTelegram(message) {
  if (!token || !chatId) return;

  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  const fullMessage = `🎉 freednsafraid 登录通知\n\n登录时间：${timeStr}\n\n${message}`;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullMessage
    }, { timeout: 10000 });
    console.log('✅ Telegram 通知发送成功');
  } catch (e) {
    console.log('⚠️ Telegram 发送失败');
  }
}

async function loginWithAccount(user, pass) {
  console.log(`\n🚀 开始登录 FreeDNS: ${user}`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let page;
  let result = { user, success: false, message: '' };

  try {
    page = await browser.newPage();
    page.setDefaultTimeout(30000);

    console.log(`📱 ${user} - 打开 FreeDNS 登录页`);
    await page.goto('https://freedns.afraid.org/zc.php?from=L21lbnUv');

    await page.waitForTimeout(2000);

    console.log(`📝 ${user} - 填写邮箱`);
    await page.fill('input[name="username"]', user);

    console.log(`🔒 ${user} - 填写密码`);
    await page.fill('input[name="password"]', pass);

    console.log(`📤 ${user} - 提交登录`);
    await page.click('input[type="submit"], button[type="submit"]');

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    // 判断登录成功（后台页面通常包含 Logout 或 Subdomains）
    const content = await page.content();

    if (content.includes('Logout') || content.includes('Subdomains')) {
      console.log(`✅ ${user} 登录成功`);
      result.success = true;
      result.message = `✅ ${user} 登录成功`;
    } else {
      console.log(`❌ ${user} 登录失败`);
      result.message = `❌ ${user} 登录失败`;
    }

  } catch (e) {
    console.log(`❌ ${user} 登录异常: ${e.message}`);
    result.message = `❌ ${user} 登录异常: ${e.message}`;
  } finally {
    if (page) await page.close();
    await browser.close();
  }

  return result;
}

async function main() {
  console.log(`🔍 发现 ${accountList.length} 个账号需要登录`);
  
  const results = [];
  
  for (let i = 0; i < accountList.length; i++) {
    const { user, pass } = accountList[i];
    console.log(`\n📋 处理第 ${i + 1}/${accountList.length} 个账号: ${user}`);
    
    const result = await loginWithAccount(user, pass);
    results.push(result);
    
    // 如果不是最后一个账号，等待一下再处理下一个
    if (i < accountList.length - 1) {
      console.log('⏳ 等待3秒后处理下一个账号...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // 汇总所有结果并发送一条消息
  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;
  
  let summaryMessage = `📊 登录汇总: ${successCount}/${totalCount} 个账号成功\n\n`;
  
  results.forEach(result => {
    summaryMessage += `${result.message}\n`;
  });
  
  await sendTelegram(summaryMessage);
  
  console.log('\n✅ 所有账号处理完成！');
}

main().catch(console.error);
