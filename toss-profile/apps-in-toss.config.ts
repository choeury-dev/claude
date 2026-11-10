import { defineConfig } from '@apps-in-toss/web-framework/config';

// appName 은 앱인토스 콘솔에 등록한 이름과 같아야 한다.
export default defineConfig({
  appName: 'hyodo-profile',
  permissions: [
    { name: 'photos', access: 'read' },
    { name: 'camera', access: 'access' },
  ],
  navigationBar: { withBackButton: true, withHomeButton: true, withTitle: true },
  webBundleDir: 'dist',
});
