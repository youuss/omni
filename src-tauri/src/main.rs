// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "macos")]
    fix_path_env();

    omni_lib::run()
}

/// macOS 打包应用从 Finder 启动时不会继承用户 shell 的 $PATH，
/// 导致找不到 claude 等通过 Homebrew / npm / pip 安装的命令。
/// 这里启动一个 login shell 获取完整 PATH 并注入当前进程。
#[cfg(target_os = "macos")]
fn fix_path_env() {
    use std::process::Command;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    if let Ok(output) = Command::new(&shell)
        .args(["-l", "-i", "-c", "echo __PATH_START__${PATH}__PATH_END__"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let (Some(start), Some(end)) = (
            stdout.find("__PATH_START__"),
            stdout.find("__PATH_END__"),
        ) {
            let path = &stdout[start + "__PATH_START__".len()..end];
            std::env::set_var("PATH", path);
        }
    }
}
