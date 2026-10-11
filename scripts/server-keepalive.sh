#!/bin/bash
# Self-fork script — bu script'i çağıran shell kapansa bile yaşamalı.
# Çünkü exec ile mevcut process'i değiştiriyor, child değil.
cd /home/z/my-project
exec npm run dev
