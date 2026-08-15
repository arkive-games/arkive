import { DEFAULT_AUTH_STRINGS, resolveAuthStrings, type AuthStrings } from "./strings"

/**
 * Translations for the auth UI, in one place.
 *
 * Every app would otherwise carry its own copy of ~40 keys across between 3 and
 * 17 locales, which is several thousand duplicated strings and six places for a
 * wording change to be missed. This is plain data rather than an i18next
 * instance, so it stays a table the apps read from rather than a second i18n
 * system competing with theirs.
 *
 * zh-CN, zh-TW and en-US are complete, per the project's language policy.
 * ja-JP and ko-KR cover the strings a visitor actually sees on the way through —
 * the rest fall back to English via resolveAuthStrings rather than being
 * machine-translated into something nobody has read.
 */
const ZH_CN: AuthStrings = {
  signIn: "登录",
  signOut: "退出登录",
  signUp: "注册",
  account: "账号",

  emailLabel: "邮箱",
  emailPlaceholder: "you@example.com",
  passwordLabel: "密码",
  passwordPlaceholder: "至少 8 个字符",
  showPassword: "显示密码",
  hidePassword: "隐藏密码",
  nameLabel: "昵称",
  namePlaceholder: "其他人看到的名字",

  loginTitle: "登录藏舟",
  loginSubmit: "登录",
  registerTitle: "注册藏舟账号",
  registerSubmit: "创建账号",
  switchToRegister: "还没有账号？立即注册",
  switchToLogin: "已有账号？返回登录",

  forgotPassword: "忘记密码？",
  forgotTitle: "重置密码",
  forgotDescription: "输入你的邮箱，我们会发送重置链接。",
  forgotSubmit: "发送重置链接",
  forgotSent: "如果该邮箱已注册，重置链接已发送。",

  resetTitle: "设置新密码",
  resetTokenLabel: "重置码",
  newPasswordLabel: "新密码",
  resetSubmit: "更新密码",
  resetDone: "密码已更新，现在可以登录了。",

  verifyPending: "邮箱尚未验证。",
  verifyResend: "重新发送验证邮件",
  verifySent: "验证邮件已发送，请查收。",
  verifyDone: "邮箱已验证。",

  challengeLoading: "正在准备验证…",
  challengeSolving: "正在验证…",
  challengeIdle: "受人机验证保护",
  confirmPasswordLabel: "确认密码",
  confirmPasswordPlaceholder: "再输入一次",
  passwordMismatch: "两次输入的密码不一致。",
  challengeReady: "验证完成",
  challengeFailed: "验证失败，请重试。",

  working: "处理中…",
  cancel: "取消",
  close: "关闭",
  dismiss: "知道了",

  errors: {
    UnauthorizedError: "请先登录。",
    PermissionError: "你没有权限访问。",
    UserBadCredentialsError: "邮箱或密码不正确。",
    UserAlreadyExistsError: "该昵称已被使用。",
    UserEmailAlreadyExistsError: "该邮箱已注册。",
    UserInvalidPasswordError: "请设置更长、更不易猜到的密码。",
    UserInactiveError: "该账号已被停用。",
    UserAlreadyVerifiedError: "该邮箱已验证。",
    AltchaChallengeError: "验证失败，请重试。",
    RateLimitExceededError: "尝试次数过多，请稍后再试。",
    InvalidTokenError: "链接无效或已过期。",
    ValidationError: "请检查填写的内容。",
    NetworkError: "无法连接服务器，请检查网络。",
    UnknownError: "出错了，请重试。",
  },
}

const ZH_TW: AuthStrings = {
  signIn: "登入",
  signOut: "登出",
  signUp: "註冊",
  account: "帳號",

  emailLabel: "電子郵件",
  emailPlaceholder: "you@example.com",
  passwordLabel: "密碼",
  passwordPlaceholder: "至少 8 個字元",
  showPassword: "顯示密碼",
  hidePassword: "隱藏密碼",
  nameLabel: "暱稱",
  namePlaceholder: "其他人看到的名字",

  loginTitle: "登入藏舟",
  loginSubmit: "登入",
  registerTitle: "註冊藏舟帳號",
  registerSubmit: "建立帳號",
  switchToRegister: "還沒有帳號？立即註冊",
  switchToLogin: "已有帳號？返回登入",

  forgotPassword: "忘記密碼？",
  forgotTitle: "重設密碼",
  forgotDescription: "輸入你的電子郵件，我們會寄送重設連結。",
  forgotSubmit: "寄送重設連結",
  forgotSent: "如果該郵件地址已註冊，重設連結已寄出。",

  resetTitle: "設定新密碼",
  resetTokenLabel: "重設碼",
  newPasswordLabel: "新密碼",
  resetSubmit: "更新密碼",
  resetDone: "密碼已更新，現在可以登入了。",

  verifyPending: "電子郵件尚未驗證。",
  verifyResend: "重新寄送驗證信",
  verifySent: "驗證信已寄出，請查收。",
  verifyDone: "電子郵件已驗證。",

  challengeLoading: "正在準備驗證…",
  challengeSolving: "正在驗證…",
  challengeIdle: "受人機驗證保護",
  confirmPasswordLabel: "確認密碼",
  confirmPasswordPlaceholder: "再輸入一次",
  passwordMismatch: "兩次輸入的密碼不一致。",
  challengeReady: "驗證完成",
  challengeFailed: "驗證失敗，請重試。",

  working: "處理中…",
  cancel: "取消",
  close: "關閉",
  dismiss: "知道了",

  errors: {
    UnauthorizedError: "請先登入。",
    PermissionError: "你沒有權限存取。",
    UserBadCredentialsError: "電子郵件或密碼不正確。",
    UserAlreadyExistsError: "該暱稱已被使用。",
    UserEmailAlreadyExistsError: "該電子郵件已註冊。",
    UserInvalidPasswordError: "請設定更長、更不易猜到的密碼。",
    UserInactiveError: "該帳號已被停用。",
    UserAlreadyVerifiedError: "該電子郵件已驗證。",
    AltchaChallengeError: "驗證失敗，請重試。",
    RateLimitExceededError: "嘗試次數過多，請稍後再試。",
    InvalidTokenError: "連結無效或已過期。",
    ValidationError: "請檢查填寫的內容。",
    NetworkError: "無法連線伺服器，請檢查網路。",
    UnknownError: "發生錯誤，請重試。",
  },
}

const JA_JP: Partial<AuthStrings> = {
  signIn: "ログイン",
  signOut: "ログアウト",
  signUp: "新規登録",
  account: "アカウント",
  emailLabel: "メールアドレス",
  passwordLabel: "パスワード",
  nameLabel: "表示名",
  loginTitle: "Arkive にログイン",
  loginSubmit: "ログイン",
  registerTitle: "Arkive アカウントを作成",
  registerSubmit: "アカウントを作成",
  switchToRegister: "アカウントをお持ちでない方はこちら",
  switchToLogin: "すでにアカウントをお持ちの方はこちら",
  forgotPassword: "パスワードをお忘れですか？",
  working: "処理中…",
  errors: {
    ...DEFAULT_AUTH_STRINGS.errors,
    UserBadCredentialsError: "メールアドレスまたはパスワードが正しくありません。",
    UserEmailAlreadyExistsError: "このメールアドレスは既に登録されています。",
    RateLimitExceededError: "試行回数が多すぎます。しばらくお待ちください。",
    NetworkError: "サーバーに接続できません。",
  },
}

const KO_KR: Partial<AuthStrings> = {
  signIn: "로그인",
  signOut: "로그아웃",
  signUp: "회원가입",
  account: "계정",
  emailLabel: "이메일",
  passwordLabel: "비밀번호",
  nameLabel: "표시 이름",
  loginTitle: "Arkive 로그인",
  loginSubmit: "로그인",
  registerTitle: "Arkive 계정 만들기",
  registerSubmit: "계정 만들기",
  switchToRegister: "계정이 없으신가요? 가입하기",
  switchToLogin: "이미 계정이 있으신가요? 로그인",
  forgotPassword: "비밀번호를 잊으셨나요?",
  working: "처리 중…",
  errors: {
    ...DEFAULT_AUTH_STRINGS.errors,
    UserBadCredentialsError: "이메일 또는 비밀번호가 올바르지 않습니다.",
    UserEmailAlreadyExistsError: "이미 등록된 이메일입니다.",
    RateLimitExceededError: "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    NetworkError: "서버에 연결할 수 없습니다.",
  },
}

const CATALOGUE: Record<string, Partial<AuthStrings>> = {
  "en-US": DEFAULT_AUTH_STRINGS,
  "zh-CN": ZH_CN,
  "zh-TW": ZH_TW,
  "ja-JP": JA_JP,
  "ko-KR": KO_KR,
}

/**
 * Resolves strings for an i18next language tag.
 *
 * Falls back along the tag rather than only on an exact match, so `zh`,
 * `zh-Hans`, `zh-CN` and `zh-SG` all land on Simplified, and `zh-TW`, `zh-Hant`
 * and `zh-HK` on Traditional. Anything unrecognised gets English, which is
 * exactly what an app with seventeen locales needs — it ships the feature
 * without pretending the other fourteen are translated.
 */
export function authStringsFor(language: string | undefined): AuthStrings {
  const tag = (language ?? "").trim()
  if (!tag) return DEFAULT_AUTH_STRINGS

  const exact = CATALOGUE[tag]
  if (exact) return resolveAuthStrings(exact)

  const lower = tag.toLowerCase()
  if (lower.startsWith("zh")) {
    const traditional = /hant|tw|hk|mo/.test(lower)
    return resolveAuthStrings(traditional ? ZH_TW : ZH_CN)
  }
  if (lower.startsWith("ja")) return resolveAuthStrings(JA_JP)
  if (lower.startsWith("ko")) return resolveAuthStrings(KO_KR)

  const base = lower.split(/[-_]/)[0]
  for (const key of Object.keys(CATALOGUE)) {
    if (key.toLowerCase().split("-")[0] === base) return resolveAuthStrings(CATALOGUE[key])
  }
  return DEFAULT_AUTH_STRINGS
}

/** Locale tags with a hand-written translation, for tests and tooling. */
export const AUTH_LOCALES = Object.keys(CATALOGUE)
