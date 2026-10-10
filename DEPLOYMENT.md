# Deployment on Ash

The authoritative checkout is `/home/tc/three-body-problem` on Ash (Ubuntu WSL, SSH 2222). https://nbody.by.tc serves its `dist/` directory. Source, existing dependencies, configuration and compiled assets were preserved during migration on October 10, 2026.

Run `npm run build` in this checkout on Ash to publish; use `npm ci` first when dependencies need installation. A build in the retained Phoenix copy no longer changes the public site. There is no deployment CI or application backend.

Phoenix retains public HTTPS and certificate renewal during migration and proxies this site to Ash port 18081. The current Ash vhost is `deploy/nbody.by.tc.migration.conf`; the complete HTTPS template is `deploy/nbody.by.tc.conf` for the later gateway handoff. Validate nginx before reloading. The normal Ash static-site backup covers the source and compiled site.
