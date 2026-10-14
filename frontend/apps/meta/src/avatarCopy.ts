export function avatarCopy(language: string) {
  if (language === 'zh-CN') return {
    legacy: '已找回此浏览器中尚未同步的旧头像。确认后才会上传到账户，其他设备和帖子也会使用它。',
    failed: '头像未能保存，请重试。当前选择仍然保留。',
  }
  if (language === 'zh-TW') return {
    legacy: '已找回此瀏覽器中尚未同步的舊頭像。確認後才會上傳至帳戶，其他裝置和帖子也會使用它。',
    failed: '頭像未能儲存，請重試。目前的選擇仍然保留。',
  }
  if (language === 'ja-JP') return {
    legacy: 'このブラウザーに保存された未同期の画像を復元しました。確認するとアカウントにアップロードされます。',
    failed: 'アバターを保存できませんでした。選択は保持されています。もう一度お試しください。',
  }
  if (language === 'ko-KR') return {
    legacy: '이 브라우저에 저장된 미동기화 이미지를 복원했습니다. 확인하면 계정에 업로드됩니다.',
    failed: '아바타를 저장하지 못했습니다. 선택한 이미지는 유지됩니다. 다시 시도해 주세요.',
  }
  return {
    legacy: 'Recovered an avatar saved only in this browser. Confirm to upload it to your account for posts and other devices.',
    failed: 'Could not save your avatar. Your selection is preserved. Please try again.',
  }
}
