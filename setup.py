from setuptools import setup, Extension, find_packages
import sys

# The following line is modified by setver.bash
version = '0.0.0'

# # https://setuptools.readthedocs.io/en/latest/setuptools.html#basic-use
setup(
    name = "valkka_streamer",
    version = version,
    install_requires = [
        "setproctitle", # 1.2.2 # set your process titles for easier debugging
        "PyYAML", # 5.4.1
        "numpy", # 1.22.4
        "websockets>=12.0", # 11.0.3
        "task-virtualthread",
        "Pillow", # 9.0.1
    ],
    include_package_data=True, # # conclusion: NEVER forget this : files get included but not installed
    # # WARNING: If you are using namespace packages, automatic package finding does not work, so use this:
    packages=[
        'valkka.streamer.multiprocess',
        'valkka.streamer.analyzers',
        'valkka.streamer.chain'
    ],
    
    #scripts=[
    #    "bin/somescript"
    #],

    # # "entry points" get installed into $HOME/.local/bin
    # # https://unix.stackexchange.com/questions/316765/which-distributions-have-home-local-bin-in-path
    entry_points={
        'console_scripts': [
            'valkka-streamer = valkka.streamer.cli:main' # this would create a command "my-command" that maps to skeleton.subpackage1.cli method "main"
        ]
    },
    
    # # enable this if you need to run a post-install script:
    #cmdclass={
    #  'install': PostInstallCommand,
    #  },
    
    # metadata for upload to PyPI
    author           = "Sampsa Riikonen",
    author_email     = "sampsa.riikonen@iki.fi",
    description      = "A template for python projects",
    license          = "MIT",
    keywords         = "python sphinx packaging",
    url              = "https://elsampsa.github.io/skeleton/", # project homepage
    
    long_description ="""
    A python scaffold project
    """,
    long_description_content_type='text/plain',
    # long_description_content_type='text/x-rst', # this works
    # long_description_content_type='text/markdown', # this does not work
    
    classifiers      =[  # Optional
        # How mature is this project? Common values are
        #   3 - Alpha
        #   4 - Beta
        #   5 - Production/Stable
        'Development Status :: 3 - Alpha',
        # Indicate who your project is intended for
        'Intended Audience :: Developers',
        'Operating System :: POSIX :: Linux',
        # 'Topic :: Multimedia :: Video', # set a topic
        # Pick your license as you wish
        'License :: OSI Approved :: GNU Affero General Public License v3 or later (AGPLv3+)',
        # Specify the Python versions you support here. In particular, ensure
        # that you indicate whether you support Python 2, Python 3 or both.
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
        'Programming Language :: Python :: 3.6',
    ]
    #project_urls={ # some additional urls
    #    'Tutorial': 'https://elsampsa.github.io/skeleton/'
    #},
)
