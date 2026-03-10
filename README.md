# 🐦 Twitter-style 개인 홈페이지

GitHub Pages로 운영되는 트위터 스타일 개인 홈페이지입니다.

## ✨ 기능

- 📝 트위터 스타일 포스트 피드
- 🧵 스레드 형식 (답글 연결)
- 🏷️ 카테고리 필터링
- 💬 Giscus 댓글 (GitHub Discussions 기반)
- ✏️ GitHub API로 포스트 작성/수정/삭제
- 📱 반응형 디자인

---

## 🚀 설치 방법

### 1단계 — GitHub 레포지토리 생성

1. [GitHub](https://github.com/new)에서 새 레포지토리 생성
2. 레포 이름: `my-homepage` (또는 원하는 이름)
3. **Public** 으로 설정 (GitHub Pages 무료 호스팅)
4. 이 폴더의 모든 파일을 레포에 업로드

```bash
git init
git add .
git commit -m "Initial homepage"
git branch -M main
git remote add origin https://github.com/USERNAME/REPONAME.git
git push -u origin main
```

### 2단계 — GitHub Pages 활성화

1. 레포 → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Save 클릭
5. 몇 분 후 `https://USERNAME.github.io/REPONAME` 접속 가능

### 3단계 — 프로필 설정

`data/posts.json` 파일의 `config` 섹션을 수정하세요:

```json
{
  "config": {
    "author": "홍길동",
    "bio": "개발자, 글쓰기를 좋아하는 사람",
    "avatar": "https://github.com/USERNAME.png",
    "categories": ["일상", "개발", "생각", "여행"]
  }
}
```

### 4단계 — GitHub Personal Access Token 발급

포스트 작성을 위해 토큰이 필요합니다 (본인만 사용).

1. [GitHub Settings → Tokens](https://github.com/settings/tokens/new) 접속
2. Note: `my-homepage`
3. **Expiration**: No expiration (또는 원하는 기간)
4. **Scopes**: `repo` 체크 ✓
5. **Generate token** 클릭
6. 토큰 복사 (다시 볼 수 없음!)

### 5단계 — 댓글 설정 (Giscus)

1. 레포에서 **Settings** → **Features** → **Discussions** 활성화
2. [giscus.app/ko](https://giscus.app/ko) 접속
3. 레포 정보 입력 후 설정값 확인
4. `index.html`의 `GISCUS_CONFIG` 수정:

```javascript
window.GISCUS_CONFIG = {
  repo: "USERNAME/REPONAME",
  repoId: "R_xxxxxxxx",       // giscus에서 확인
  category: "General",
  categoryId: "DIC_xxxxxxxxx"  // giscus에서 확인
};
```

---

## 📖 사용법

### 포스트 작성

1. 홈페이지 접속 후 우측 하단 **✏️ 버튼** 클릭
2. GitHub 사용자명, 레포이름, Access Token 입력 (최초 1회)
3. 내용 작성 → **포스트** 버튼 (또는 `Ctrl+Enter`)

### 스레드 작성

포스트 카드 hover → **↩ 답글** 버튼 클릭 후 내용 작성

### 포스트 수정

포스트 hover → **✏️ 수정** 버튼 클릭

### 포스트 삭제

포스트 hover → **🗑️ 삭제** 버튼 클릭

---

## 📁 파일 구조

```
/
├── index.html          # 메인 앱
├── css/
│   └── style.css       # 스타일
├── js/
│   └── app.js          # 앱 로직
├── data/
│   └── posts.json      # 포스트 데이터 (자동 관리)
├── _config.yml         # GitHub Pages 설정
└── README.md
```

---

## 🎨 커스터마이징

`css/style.css` 상단의 CSS 변수를 수정하세요:

```css
:root {
  --accent: #e8956d;    /* 포인트 컬러 */
  --bg: #0d0d0d;        /* 배경색 */
  --text: #e8e3dc;      /* 텍스트 색 */
}
```

`index.html`의 `<title>` 태그와 `My Space` 로고 텍스트도 바꾸세요.

---

## ⚠️ 보안 주의사항

- GitHub Token은 **브라우저의 localStorage에만** 저장됩니다
- 공용 컴퓨터에서 로그인 후 반드시 **관리자 로그아웃**하세요
- Token에는 **repo 권한만** 부여하세요
- Token이 노출된 경우 즉시 GitHub에서 폐기하세요

---

## 🤔 자주 묻는 질문

**Q: 포스트 저장 후 바로 반영이 안돼요**  
A: GitHub Pages 캐시 때문에 최대 5분 소요될 수 있습니다. 새로고침하면 즉시 보입니다.

**Q: 이미지 첨부는 어떻게 하나요?**  
A: 이미지를 GitHub 레포에 업로드 후 URL을 포스트 내용에 붙여넣으세요.

**Q: 도메인 연결이 가능한가요?**  
A: GitHub Pages Settings에서 Custom Domain을 설정할 수 있습니다.
