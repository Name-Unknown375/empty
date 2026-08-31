/* LaunchAgent entry: Mach-O inside ClarityPull.app so macOS TCC can
   grant Documents access to this bundle, not to /bin/bash. */
#include "paths.h"

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static void log_msg(const char *msg) {
    char path[1024];
    snprintf(path, sizeof(path), "%s/clarity-pull.log", FPR_SUPPORT);
    FILE *f = fopen(path, "a");
    if (!f) {
        return;
    }
    time_t t = time(NULL);
    struct tm tm;
    gmtime_r(&t, &tm);
    char ts[40];
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &tm);
    fprintf(f, "%s\n", msg);
    fclose(f);
}

static void load_env_file(void) {
    char path[1024];
    snprintf(path, sizeof(path), "%s/clarity.env", FPR_SUPPORT);
    FILE *f = fopen(path, "r");
    if (!f) {
        return;
    }
    char line[8192];
    while (fgets(line, sizeof(line), f)) {
        char *nl = strchr(line, '\n');
        if (nl) {
            *nl = '\0';
        }
        if (line[0] == '\0' || line[0] == '#') {
            continue;
        }
        char *eq = strchr(line, '=');
        if (!eq) {
            continue;
        }
        *eq = '\0';
        char *key = line;
        char *val = eq + 1;
        size_t n = strlen(val);
        if (n >= 2 && ((val[0] == '\'' && val[n - 1] == '\'') ||
                       (val[0] == '"' && val[n - 1] == '"'))) {
            val[n - 1] = '\0';
            val++;
        }
        if (key[0] != '\0') {
            setenv(key, val, 0);
        }
    }
    fclose(f);
}

static int run_pull(void) {
    char py[1024];
    char logpath[1024];
    char outdir[1024];
    snprintf(py, sizeof(py), "%s/pull.py", FPR_SUPPORT);
    snprintf(logpath, sizeof(logpath), "%s/clarity-pull.log", FPR_SUPPORT);
    snprintf(outdir, sizeof(outdir), "%s/snapshots", FPR_SUPPORT);

    setenv("PATH", "/usr/bin:/bin:/usr/sbin:/sbin", 1);
    setenv("HOME", FPR_HOME, 1);
    setenv("CLARITY_OUT", outdir, 1);
    load_env_file();
    if (chdir(FPR_SUPPORT) != 0) {
        log_msg("chdir Application Support failed");
        return 1;
    }

    pid_t pid = fork();
    if (pid < 0) {
        log_msg("fork failed");
        return 1;
    }
    if (pid == 0) {
        int fd = open(logpath, O_WRONLY | O_CREAT | O_APPEND, 0644);
        if (fd >= 0) {
            dup2(fd, STDOUT_FILENO);
            dup2(fd, STDERR_FILENO);
            if (fd > STDERR_FILENO) {
                close(fd);
            }
        }
        execl("/usr/bin/python3", "python3", py, (char *)NULL);
        _exit(127);
    }
    int st = 0;
    if (waitpid(pid, &st, 0) < 0) {
        log_msg("waitpid failed");
        return 1;
    }
    if (WIFEXITED(st)) {
        return WEXITSTATUS(st);
    }
    return 1;
}

static int sync_into_repo(void) {
    char src[1024];
    char dst[1024];
    char marker[1024];
    snprintf(src, sizeof(src), "%s/snapshots", FPR_SUPPORT);
    snprintf(dst, sizeof(dst), "%s", FPR_REPO);
    snprintf(marker, sizeof(marker), "%s/.launchd-ok", FPR_REPO);

    if (mkdir(dst, 0755) != 0 && errno != EEXIST) {
        log_msg("mkdir repo reports/clarity failed (Documents TCC?)");
        return 1;
    }

    pid_t pid = fork();
    if (pid < 0) {
        log_msg("fork ditto failed");
        return 1;
    }
    if (pid == 0) {
        execl("/usr/bin/ditto", "ditto", src, dst, (char *)NULL);
        _exit(127);
    }
    int st = 0;
    waitpid(pid, &st, 0);
    if (!WIFEXITED(st) || WEXITSTATUS(st) != 0) {
        log_msg("ditto into repo failed (click Allow for Documents if prompted)");
        return 1;
    }

    FILE *m = fopen(marker, "w");
    if (!m) {
        log_msg("could not write .launchd-ok in the repo (Documents TCC?)");
        return 1;
    }
    fprintf(m, "ok\n");
    fclose(m);
    log_msg("synced snapshots into repo");
    return 0;
}

int main(void) {
    log_msg("----- launch -----");
    int rc = run_pull();
    if (rc != 0) {
        char buf[64];
        snprintf(buf, sizeof(buf), "pull.py exit %d", rc);
        log_msg(buf);
    }
    int syncrc = sync_into_repo();
    return rc != 0 ? rc : syncrc;
}
