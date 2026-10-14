FROM ubuntu:14.04 AS builder
RUN apt-get update && apt-get install -y --no-install-recommends build-essential automake1.11 autoconf libtool bison libncurses5-dev ca-certificates && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:7e8a09380cca82d55d0ad17ee933d0376cc46b3289f6eb6f611a46be8a5b483d https://codeload.github.com/mysql/mysql-server/tar.gz/1917a99270248262f7420fc61a6f1f50bf03b9a6 /tmp/source.tar.gz
RUN mkdir /src && tar -xzf /tmp/source.tar.gz -C /src --strip-components=1
WORKDIR /src
RUN aclocal-1.11 && autoheader && libtoolize --automake --force && automake-1.11 --add-missing --force && autoconf && cd innobase && aclocal-1.11 && autoheader && automake-1.11 --add-missing && autoconf
RUN CFLAGS="-O2" CXXFLAGS="-O2 -fpermissive" ./configure --prefix=/opt/mysql --with-innodb --without-berkeley-db --without-ndbcluster --without-docs --without-man --without-openssl --without-yassl --with-extra-charsets=all --with-unix-socket-path=/tmp/mysql.sock
ADD --checksum=sha256:52f78aa4761a74ceb7fdf770f3554dd84308c3b93c4255e3a5c17558ecda293e https://ftp.gnu.org/gnu/bison/bison-2.3.tar.gz /tmp/bison.tar.gz
RUN mkdir /tmp/bison && tar -xzf /tmp/bison.tar.gz -C /tmp/bison --strip-components=1 && cd /tmp/bison && CFLAGS="-O2 -fgnu89-inline" ./configure --prefix=/opt/bison && make -j4 && make install
RUN PATH="/opt/bison/bin:$PATH" make -j4 > /tmp/build.log 2>&1 || { tail -100 /tmp/build.log; exit 1; }
RUN make install > /tmp/install.log 2>&1 || { tail -100 /tmp/install.log; exit 1; }
RUN /opt/bison/bin/bison -y -p MYSQL -d --output=/tmp/sql_yacc.cc sql/sql_yacc.yy

FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends libncurses5 libstdc++6 perl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /opt/mysql /opt/mysql
ENV PATH="/opt/mysql/bin:/opt/mysql/libexec:${PATH}"
RUN groupadd --system mysql && useradd --system --gid mysql mysql && mysqld --version
COPY my.cnf /etc/my.cnf
COPY entrypoint.sh /usr/local/bin/mysql-entrypoint
RUN chmod +x /usr/local/bin/mysql-entrypoint
EXPOSE 3306
ENTRYPOINT ["/usr/local/bin/mysql-entrypoint"]
