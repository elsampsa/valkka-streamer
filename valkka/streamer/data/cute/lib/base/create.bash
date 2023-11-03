#!/bin/bash
## ./create.bash NewWidget
lowercase=$(python3 -c 'import sys
print(sys.argv[1].lower())
' $1)
target_js=$lowercase".js"
target_html=$lowercase".html"
cp example.js $target_js
cp example.html $target_html
# sed -i -r "s/"
sed -i -r "s/MyWidget/"$1"/g" $target_js
sed -i -r "s/MyWidget/"$1"/g" $target_html
sed -i -r "s/mywidget.js/"$target_js"/g" $target_html
sed -i -r "s/Widget Example/"$1" Example/g" $target_html
