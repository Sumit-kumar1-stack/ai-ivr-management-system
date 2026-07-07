import { prisma } from "@/lib/prisma";

export interface ContactQuery {

    page?: number;

    limit?: number;

    search?: string;

    language?: string;

    status?: string;

}

export const ContactRepository = {

    async findMany(query: ContactQuery) {

        const page = query.page ?? 1;

        const limit = query.limit ?? 10;

        const skip = (page - 1) * limit;

        const where: any = {};

        if (query.search) {

            where.OR = [

                {
                    fullName: {
                        contains: query.search,
                        mode: "insensitive",
                    },
                },

                {
                    phone: {
                        contains: query.search,
                    },
                },

                {
                    email: {
                        contains: query.search,
                        mode: "insensitive",
                    },
                },

            ];

        }

        if (query.language) {

            where.language = query.language;

        }

        if (query.status) {

            where.status = query.status;

        }

        const [contacts, total] = await Promise.all([

            prisma.contact.findMany({

                where,

                skip,

                take: limit,

                orderBy: {

                    createdAt: "desc",

                },

            }),

            prisma.contact.count({

                where,

            }),

        ]);

        return {

            contacts,

            total,

        };

    },

    findById(id: string) {

        return prisma.contact.findUnique({

            where: {

                id,

            },

        });

    },

    findByPhone(phone: string) {

        return prisma.contact.findUnique({

            where: {

                phone,

            },

        });

    },

    create(data: any) {

        return prisma.contact.create({

            data,

        });

    },

    update(id: string, data: any) {

        return prisma.contact.update({

            where: {

                id,

            },

            data,

        });

    },

    delete(id: string) {

        return prisma.contact.delete({

            where: {

                id,

            },

        });

    },

    bulkCreate(data: any[]) {

        return prisma.contact.createMany({

            data,

            skipDuplicates: true,

        });

    },

};