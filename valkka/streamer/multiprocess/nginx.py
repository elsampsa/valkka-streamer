#!/usr/bin/python3
import sys, os, shlex, time, shutil, argparse, configparser, logging
from pprint import pprint
from logging import config
from pathlib import Path
import subprocess


def genConfigFile(**kwargs):
    """Generate nginx config file

    Parameters and example values:

    :param tmpdir: path_to_logs_and_pids
    :param user: unix_user_name
    :param main_port: 8088
    :param root_dir: /path/to/dir
    :param index: index.html
    :param backend_slug: api_v1
    :param frontend: frontend
    :param backend: backend
    :param backend_port: 8080
    :param streamer: streamer
    :param ws_port: 3001
    :param no_cache: optional argument: if present and True, 
        nginx tells browser not to cache content

    """
    if ("no_cache" in kwargs) and (kwargs["no_cache"] is True):
        cache_control_part="""
        # tell browser to not use cache
        add_header Last-Modified $date_gmt;
        add_header Cache-Control 'no-store, no-cache';
        if_modified_since off;
        expires off;
        etag off;
        """
    else:
        cache_control_part=""

    if "no_cache" in kwargs: kwargs.pop("no_cache")
    kwargs["cache_control_part"] = cache_control_part

    return """user {user};
    worker_processes  1;
    daemon off;
    error_log  {tmpdir}/error.log warn;
    pid        {tmpdir}/nginx.pid;
    events {{
        worker_connections  1024;
    }}

    http {{    
        include       /etc/nginx/mime.types;
        default_type  application/octet-stream;
        log_format  main  '$remote_addr - $remote_user [$time_local] "$request" '
                        '$status $body_bytes_sent "$http_referer" '
                        '"$http_user_agent" "$http_x_forwarded_for"';
        access_log    {tmpdir}/access.log  main;
        sendfile      on;
        keepalive_timeout  65;

        server {{
            listen {main_port};  # nginx listening in this port

            location / {{
                root   {root_dir};
                index  {index};
                client_max_body_size  500m;
                {cache_control_part}
            }}

            location /{backend_slug}/ {{
                client_max_body_size            500m;
                proxy_pass_request_headers      on;
                proxy_set_header Origin         http://{frontend};
                proxy_pass                      http://{backend}:{backend_port}/{backend_slug}/;
                {cache_control_part}
            }}
            location /ws {{
                proxy_pass http://{streamer}:{ws_port};
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection "upgrade";
            }}
        }}
    }}
    """.format(**kwargs)

class NGWrapper:

    def __init__(self, cfg):
        user = os.environ['USER']
        self.tmpdir=f"/tmp/my_nginx_tmp_{user}"
        self.config_file=f"/tmp/my_nginx_tmp_{user}/nginx.conf"
        self.cfg_file_st = genConfigFile(
            user=os.environ["USER"],
            tmpdir=self.tmpdir,
            main_port=cfg["port"],
            root_dir=cfg["path"],
            index=cfg["index"],
            backend_slug="api_v1",
            frontend="localhost",
            backend="localhost",
            backend_port=8081,
            streamer="localhost",
            ws_port=cfg["ws_port"],
            no_cache=True
        )

        # nginx -p $PWD -c config/nginx.conf -g 'error_log error.log;'
        self.comm = "nginx -p {tmpdir} -c {config_file} -g 'error_log error.log;'".format(
            tmpdir=self.tmpdir,
            config_file=self.config_file
        )
        error_logfile=os.path.join(self.tmpdir, "error.log")
        access_logfile=os.path.join(self.tmpdir, "access.log")
        print("error log in: ", error_logfile)
        print("access log in: ", access_logfile)
        try:
            os.remove(error_logfile)
        except FileNotFoundError:
            pass
        try:
            os.remove(access_logfile)
        except FileNotFoundError:
            pass

    def start(self):
        os.makedirs(self.tmpdir, exist_ok=True)
        with open(self.config_file,"w") as f:
            f.write(self.cfg_file_st)
        os.system("killall -9 nginx") # just in case this script was previously closed "dirty"
        print("starting", self.comm)
        self.nginx_process = subprocess.Popen(
            shlex.split(self.comm)
        )

    def stop(self):
        self.nginx_process.terminate()
        print("closing nginx")
        self.nginx_process.wait()

